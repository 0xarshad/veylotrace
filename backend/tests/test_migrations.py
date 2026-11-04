import os

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.core.config import BASE_DIR, get_settings
from app.db.base import Base


def _cfg(url: str) -> Config:
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    cfg.attributes["configured"] = True
    return cfg


def test_migrations_match_models_and_are_reversible(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        cfg = _cfg(url)
        command.upgrade(cfg, "head")
        engine = create_engine(url)
        tables = set(inspect(engine).get_table_names())
        assert {"users", "refresh_tokens", "expenses", "ai_provider_configs", "audit_events", "alembic_version"} <= tables
        with engine.connect() as conn:
            diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
        assert diff == [], f"models and migrations have drifted: {diff}"
        command.downgrade(cfg, "base")
        assert set(inspect(engine).get_table_names()) == {"alembic_version"}
        command.upgrade(cfg, "head")
        engine.dispose()
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
        assert os.environ["DATABASE_URL"] == "sqlite://"
