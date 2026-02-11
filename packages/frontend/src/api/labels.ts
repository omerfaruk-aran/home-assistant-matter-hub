export interface HomeAssistantLabel {
  label_id: string;
  name: string;
  icon?: string;
  color?: string;
}

export interface HomeAssistantArea {
  area_id: string;
  name: string;
}

export async function fetchLabels(): Promise<HomeAssistantLabel[]> {
  const res = await fetch(`api/matter/labels?_s=${Date.now()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch labels");
  }
  return res.json();
}

export async function fetchAreas(): Promise<HomeAssistantArea[]> {
  const res = await fetch(`api/matter/areas?_s=${Date.now()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch areas");
  }
  return res.json();
}
