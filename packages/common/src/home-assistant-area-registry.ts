export interface HomeAssistantAreaRegistry {
  area_id: string;
  name: string;
  picture?: string | null;
  floor_id?: string | null;
  icon?: string | null;
  labels?: string[];
  aliases?: string[];
}
