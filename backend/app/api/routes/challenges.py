from datetime import date

from fastapi import APIRouter, Depends

from app.core.deps import DB, require_permission
from app.models import Challenge, User
from app.schemas.tracking import ChallengeIn, ChallengeOut, ManualCompleteIn
from app.services import challenges as svc
from app.services.crud import Spec, build_router, owned

perm = Depends(require_permission("tracking:own"))

spec = Spec(
    "challenges", "challenges", Challenge, ChallengeIn, ChallengeOut, date_field="start_date", search=("name", "description"), filters=("status", "frequency", "metric"),
    prepare=svc.prepare_challenge, enrich=svc.enrich_challenges, duplicable=False, default_sort="-id",
)

router = APIRouter()
extra = APIRouter(prefix="/challenges", tags=["challenges"], dependencies=[perm])


@extra.get("/metrics")
def metrics():
    return [{"key": k, "label": v[0], "unit": v[1], "comparator": v[2], "default_target": v[3]} for k, v in svc.METRICS.items()]


@extra.get("/{challenge_id}/history")
def history(challenge_id: int, db: DB, user: User = perm):
    ch = owned(db, Challenge, challenge_id, user.id)
    ev = svc.evaluate(db, ch)
    db.commit()
    return {"id": ch.id, "history": ev["history"][::-1][:366], **{k: v for k, v in ev.items() if k != "history"}}


def _act(challenge_id: int, db, user, fn, *args):
    ch = owned(db, Challenge, challenge_id, user.id)
    fn(db, ch, *args)
    db.commit()
    db.refresh(ch)
    row = ChallengeOut.model_validate(ch).model_dump(mode="json")
    svc.enrich_challenges(db, user.id, [row])
    return row


@extra.post("/{challenge_id}/pause")
def pause(challenge_id: int, db: DB, user: User = perm):
    return _act(challenge_id, db, user, svc.pause)


@extra.post("/{challenge_id}/resume")
def resume(challenge_id: int, db: DB, user: User = perm):
    return _act(challenge_id, db, user, svc.resume)


@extra.post("/{challenge_id}/restart")
def restart(challenge_id: int, db: DB, user: User = perm):
    return _act(challenge_id, db, user, svc.restart)


@extra.post("/{challenge_id}/complete")
def complete(challenge_id: int, body: ManualCompleteIn, db: DB, user: User = perm):
    return _act(challenge_id, db, user, svc.set_manual, body.on_date or date.today(), body.done)


# Static routes first so "/metrics" is not captured by "/{item_id}".
router.include_router(extra)
router.include_router(build_router(spec))
