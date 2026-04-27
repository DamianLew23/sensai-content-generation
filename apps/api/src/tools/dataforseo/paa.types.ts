export interface PaaFetchParams {
  keyword: string;
  languageCode: string;
  locationCode: number;
  depth: number;
}

export interface PaaQuestion {
  title: string;
}

interface PaaItemSub {
  title?: string;
  type?: string;
}

interface PaaItem {
  type?: string;
  items?: PaaItemSub[];
}

interface PaaResult {
  items?: PaaItem[];
}

interface PaaTask {
  cost?: number;
  status_code?: number;
  result: PaaResult[] | null;
}

export interface PaaRawResponse {
  status_code: number;
  status_message?: string;
  tasks: PaaTask[];
}
