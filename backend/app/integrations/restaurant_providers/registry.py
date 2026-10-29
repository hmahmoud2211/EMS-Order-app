from app.integrations.restaurant_providers.base import RestaurantProvider
from app.integrations.restaurant_providers.file_import import FileImportMenuProvider
from app.integrations.restaurant_providers.manual import ManualMenuProvider
from app.integrations.restaurant_providers.talabat import AuthorizedTalabatProvider
from app.models.enums import RestaurantSource

_PROVIDERS: dict[str, RestaurantProvider] = {
    p.key: p for p in (ManualMenuProvider(), FileImportMenuProvider(), AuthorizedTalabatProvider())
}

SOURCE_TO_PROVIDER = {
    RestaurantSource.MANUAL: "manual",
    RestaurantSource.FILE_IMPORT: "file_import",
    RestaurantSource.TALABAT: "talabat",
}


def all_providers() -> list[RestaurantProvider]:
    return list(_PROVIDERS.values())


def get_provider(key: str) -> RestaurantProvider:
    return _PROVIDERS[key]


def provider_for_source(source: str) -> RestaurantProvider:
    return _PROVIDERS[SOURCE_TO_PROVIDER.get(source, "manual")]
