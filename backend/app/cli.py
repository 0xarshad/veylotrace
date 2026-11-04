"""Operator commands:  python -m app.cli <command>

  create-admin <email> <name>   create (or promote) an administrator; prompts for the password
  verify-email <email>          mark an account's email as verified (useful with the local "file" mail backend)
  list-users                    show accounts
  backup                        create a database backup now
  outbox                        print emails written by the local "file" mail backend
"""

import getpass
import sys
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password, utcnow, validate_password_strength
from app.db.session import SessionLocal
from app.main import run_migrations
from app.models import Role, User, UserSettings
from app.services.auth import seed_roles
from app.services.defaults import DEFAULT_TARGETS, DEFAULT_WIDGETS, seed_default_categories


def create_admin(email: str, name: str) -> None:
    email = email.strip().lower()
    with SessionLocal() as db:
        seed_roles(db)
        admin_role = db.scalar(select(Role).where(Role.name == "admin"))
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role_id = admin_role.id
            user.email_verified_at = user.email_verified_at or utcnow()
            db.commit()
            print(f"Promoted existing account {email} to admin.")
            return
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Confirm password: "):
            sys.exit("Passwords do not match.")
        problems = validate_password_strength(password, email, name)
        if problems:
            sys.exit("\n".join(problems))
        user = User(email=email, name=name, password_hash=hash_password(password), role_id=admin_role.id, email_verified_at=utcnow(), password_changed_at=utcnow())
        db.add(user)
        db.flush()
        db.add(UserSettings(user_id=user.id, dashboard_widgets=list(DEFAULT_WIDGETS), targets=dict(DEFAULT_TARGETS)))
        seed_default_categories(db, user.id)
        db.commit()
        print(f"Created admin {email}.")


def verify_email(email: str) -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if not user:
            sys.exit("No such user.")
        user.email_verified_at = utcnow()
        db.commit()
        print("Email marked as verified.")


def list_users() -> None:
    with SessionLocal() as db:
        for u in db.scalars(select(User).order_by(User.id)):
            print(f"{u.id:>4}  {u.email:<32} {u.role.name:<6} {'active' if u.is_active else 'disabled':<9} {'verified' if u.email_verified_at else 'unverified'}")


def outbox() -> None:
    for f in sorted(Path(get_settings().outbox_dir).glob("*.txt")):
        print(f"--- {f.name}\n{f.read_text()}")


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return
    get_settings().validate_secrets()
    run_migrations()
    cmd = args[0]
    if cmd == "create-admin" and len(args) >= 2:
        create_admin(args[1], " ".join(args[2:]) or "Administrator")
    elif cmd == "verify-email" and len(args) == 2:
        verify_email(args[1])
    elif cmd == "list-users":
        list_users()
    elif cmd == "backup":
        from app.services.backup import create_backup

        print(create_backup("manual")["name"])
    elif cmd == "outbox":
        outbox()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
