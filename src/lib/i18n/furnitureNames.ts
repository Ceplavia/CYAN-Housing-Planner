import type { FurnitureItem, Project } from '$lib/models/types';
import { lookup, type Locale } from './index';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';

export function furnitureName(id: string, language: Locale): string {
  const item = getCatalogItem(id);
  if (!item) return id;
  return lookup(language, `furniture.${id}`) ?? item.name;
}


/** User-authored model names are retained verbatim in every interface language. */
export function customModelName(item: FurnitureItem, project?: Project | null): string | undefined {
  return item.customModelId ? project?.customModels?.find(model => model.id === item.customModelId)?.name : undefined;
}
