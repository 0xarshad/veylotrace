"""Generic, ownership-enforcing CRUD router factory used by every tracking module.

Security invariants enforced here for *all* modules:
  * Every query is filtered by the authenticated user's id (never a client-supplied id).
  * Input schemas forbid unknown fields, so a client can't set user_id/id/timestamps.
  * Foreign references (category_id, book_id, ...) must belong to the same user.
  * Missing and foreign records are indistinguishable (404) to prevent IDOR probing.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, DateTime, Integer, func, inspect, or_, select
from sqlalchemy.orm import Session

from app.core.deps import DB, client_ip, require_permission
from app.core.errors import AppError, bad_request, not_found
from app.core.security import utcnow
from app.models import User
from app.schemas.tracking import make_update
from app.services.audit import audit


@dataclass
class Spec:
    path: str
    tag: str
    model: type
    create: type[BaseModel]
    out: type[BaseModel]
    date_field: str | None = None
    search: tuple[str, ...] = ()
    filters: tuple[str, ...] = ()
    sorts: tuple[str, ...] = ()
    default_sort: str | None = None
    refs: dict[str, type] = field(default_factory=dict)
    children: dict[str, tuple[type, dict[str, type]]] = field(default_factory=dict)  # attr -> (Model, child refs)
    prepare: Callable[[Session, int, dict, Any], None] | None = None
    after_save: Callable[[Session, int, Any], None] | None = None
    enrich: Callable[[Session, int, list[dict]], None] | None = None
    duplicable: bool = True
    update: type[BaseModel] | None = None
    audit: bool = False


def owned(db: Session, model: type, obj_id: int, user_id: int, include_deleted: bool = False):
    stmt = select(model).where(model.id == obj_id, model.user_id == user_id)
    if not include_deleted and hasattr(model, "deleted_at"):
        stmt = stmt.where(model.deleted_at.is_(None))
    obj = db.scalar(stmt)
    if obj is None:
        raise not_found()
    return obj


def check_refs(db: Session, user_id: int, values: dict, refs: dict[str, type]) -> None:
    for fname, model in refs.items():
        rid = values.get(fname)
        if rid is None:
            continue
        stmt = select(model.id).where(model.id == rid, model.user_id == user_id)
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        if db.scalar(stmt) is None:
            raise AppError(422, "invalid_reference", f"Unknown {fname.removesuffix('_id').replace('_', ' ')}.", [{"field": fname, "message": "Not found."}])


def _columns(model: type) -> dict:
    return {c.key: c for c in inspect(model).mapper.column_attrs}


def _coerce(column, raw: str):
    t = column.columns[0].type
    if isinstance(t, Boolean):
        return raw.lower() in ("1", "true", "yes")
    if isinstance(t, Integer):
        return int(raw)
    return raw


def _day_bounds(col, date_from: date | None, date_to: date | None):
    conds = []
    is_dt = isinstance(col.type, DateTime)
    if date_from:
        conds.append(col >= (datetime.combine(date_from, time.min) if is_dt else date_from))
    if date_to:
        conds.append(col < datetime.combine(date_to + timedelta(days=1), time.min) if is_dt else col <= date_to)
    return conds


def build_router(spec: Spec) -> APIRouter:
    Update = spec.update or make_update(spec.create, f"{spec.create.__name__}Update")
    Create = spec.create
    Model = spec.model
    cols = _columns(Model)
    child_attrs = set(spec.children)
    perm = Depends(require_permission("tracking:own"))
    router = APIRouter(prefix=f"/{spec.path}", tags=[spec.tag], dependencies=[perm])

    def serialize(db: Session, user_id: int, objs: list) -> list[dict]:
        rows = [spec.out.model_validate(o).model_dump(mode="json") for o in objs]
        if spec.enrich:
            spec.enrich(db, user_id, rows)
        return rows

    def apply_children(db: Session, user: User, obj, child_values: dict[str, list[dict]]) -> None:
        for attr, items in child_values.items():
            child_model, child_refs = spec.children[attr]
            for item in items:
                check_refs(db, user.id, item, child_refs)
            getattr(obj, attr).clear()
            db.flush()
            for item in items:
                getattr(obj, attr).append(child_model(user_id=user.id, **item))

    @router.get("")
    def list_items(
        request: Request,
        db: DB,
        user: User = perm,
        q: str | None = Query(None, max_length=100),
        date_from: date | None = None,
        date_to: date | None = None,
        sort: str | None = Query(None, max_length=40),
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0, le=1_000_000),
        deleted: bool = False,
    ):
        stmt = select(Model).where(Model.user_id == user.id)
        stmt = stmt.where(Model.deleted_at.is_not(None) if deleted else Model.deleted_at.is_(None))
        if q:
            like = f"%{q.lower()}%"
            stmt = stmt.where(or_(*[func.lower(getattr(Model, f)).like(like) for f in spec.search])) if spec.search else stmt
        if spec.date_field and (date_from or date_to):
            for cond in _day_bounds(getattr(Model, spec.date_field), date_from, date_to):
                stmt = stmt.where(cond)
        for f in spec.filters:
            raw = request.query_params.get(f)
            if raw not in (None, ""):
                try:
                    stmt = stmt.where(getattr(Model, f) == _coerce(cols[f], raw))
                except ValueError:
                    raise bad_request(f"Invalid value for {f}.")
        total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        sort_key = (sort or spec.default_sort or (f"-{spec.date_field}" if spec.date_field else "-id")).strip()
        desc = sort_key.startswith("-")
        name = sort_key.lstrip("-")
        allowed = set(spec.sorts) | {"id", "created_at"} | ({spec.date_field} if spec.date_field else set())
        if name not in allowed:
            raise bad_request("Unsupported sort field.")
        order = getattr(Model, name)
        stmt = stmt.order_by(order.desc() if desc else order.asc(), Model.id.desc() if desc else Model.id.asc())
        items = list(db.scalars(stmt.limit(limit).offset(offset)))
        return {"items": serialize(db, user.id, items), "total": total, "limit": limit, "offset": offset}

    @router.post("", status_code=201)
    def create_item(body: Create, request: Request, db: DB, user: User = perm):  # type: ignore[valid-type]
        values = body.model_dump()
        child_values = {a: values.pop(a, None) for a in child_attrs}
        check_refs(db, user.id, values, spec.refs)
        if spec.prepare:
            spec.prepare(db, user.id, values, None)
        obj = Model(user_id=user.id, **values)
        db.add(obj)
        db.flush()
        apply_children(db, user, obj, {a: v for a, v in child_values.items() if v is not None})
        if spec.after_save:
            spec.after_save(db, user.id, obj)
        if spec.audit:
            audit(db, f"{spec.path}.create", user.id, client_ip(request), id=obj.id)
        db.commit()
        db.refresh(obj)
        return serialize(db, user.id, [obj])[0]

    @router.get("/{item_id}")
    def get_item(item_id: int, db: DB, user: User = perm):
        return serialize(db, user.id, [owned(db, Model, item_id, user.id)])[0]

    @router.put("/{item_id}")
    @router.patch("/{item_id}")
    def update_item(item_id: int, body: Update, request: Request, db: DB, user: User = perm):  # type: ignore[valid-type]
        obj = owned(db, Model, item_id, user.id)
        values = body.model_dump(exclude_unset=True)
        for k, v in list(values.items()):
            if v is None and k in cols and not cols[k].columns[0].nullable:
                values.pop(k)  # null for a required column means "leave unchanged"
        child_values = {a: values.pop(a) for a in list(child_attrs) if a in values and values[a] is not None}
        check_refs(db, user.id, values, spec.refs)
        if spec.prepare:
            spec.prepare(db, user.id, values, obj)
        for k, v in values.items():
            setattr(obj, k, v)
        apply_children(db, user, obj, child_values)
        if spec.after_save:
            spec.after_save(db, user.id, obj)
        if spec.audit:
            audit(db, f"{spec.path}.update", user.id, client_ip(request), id=obj.id)
        db.commit()
        db.refresh(obj)
        return serialize(db, user.id, [obj])[0]

    @router.delete("/{item_id}")
    def delete_item(item_id: int, request: Request, db: DB, user: User = perm, permanent: bool = False):
        obj = owned(db, Model, item_id, user.id, include_deleted=permanent)
        if permanent:
            db.delete(obj)
        else:
            obj.deleted_at = utcnow()
        db.flush()
        if spec.after_save:
            spec.after_save(db, user.id, obj)
        if spec.audit:
            audit(db, f"{spec.path}.delete", user.id, client_ip(request), id=item_id, permanent=permanent)
        db.commit()
        return {"message": "Deleted.", "id": item_id}

    @router.post("/{item_id}/restore")
    def restore_item(item_id: int, db: DB, user: User = perm):
        obj = owned(db, Model, item_id, user.id, include_deleted=True)
        obj.deleted_at = None
        if spec.after_save:
            spec.after_save(db, user.id, obj)
        db.commit()
        db.refresh(obj)
        return serialize(db, user.id, [obj])[0]

    if spec.duplicable:

        @router.post("/{item_id}/duplicate", status_code=201)
        def duplicate_item(item_id: int, db: DB, user: User = perm, overrides: Update | None = None):  # type: ignore[valid-type]
            src = owned(db, Model, item_id, user.id)
            skip = {"id", "created_at", "updated_at", "deleted_at", "user_id"}
            values = {k: getattr(src, k) for k in cols if k not in skip}
            if spec.date_field:
                col = cols[spec.date_field].columns[0].type
                values[spec.date_field] = utcnow().replace(tzinfo=None) if isinstance(col, DateTime) else date.today()
            extra = overrides.model_dump(exclude_unset=True) if overrides else {}
            for a in child_attrs:
                extra.pop(a, None)
            check_refs(db, user.id, extra, spec.refs)
            values.update({k: v for k, v in extra.items() if k in cols and not (v is None and not cols[k].columns[0].nullable)})
            clone = Model(user_id=user.id, **values)
            db.add(clone)
            db.flush()
            for attr, (child_model, _) in spec.children.items():
                ccols = _columns(child_model)
                parent_fk = next(fk.parent.key for fk in child_model.__table__.foreign_keys if fk.column.table.name == Model.__tablename__)
                for child in getattr(src, attr):
                    cv = {k: getattr(child, k) for k in ccols if k not in {"id", "user_id", parent_fk}}
                    getattr(clone, attr).append(child_model(user_id=user.id, **cv))
            if spec.after_save:
                spec.after_save(db, user.id, clone)
            db.commit()
            db.refresh(clone)
            return serialize(db, user.id, [clone])[0]

    return router


def merged(obj, values: dict, key: str, default=None):
    """Value for `key` after applying `values` to `obj` (None obj => creation)."""
    if key in values:
        return values[key]
    return getattr(obj, key, default) if obj is not None else default
