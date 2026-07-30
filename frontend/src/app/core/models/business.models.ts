export interface BusinessSearchResult {
  id: string;
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  hasWebsite: boolean;
  websiteUrl: string | null;
}

export interface BusinessSearchResponse {
  searchId: string;
  results: BusinessSearchResult[];
}

export interface BusinessSearchSummary {
  id: string;
  query: string;
  location: string | null;
  createdAt: string;
  resultCount: number;
}

export interface BusinessSearchDetail {
  id: string;
  query: string;
  location: string | null;
  createdAt: string;
  results: BusinessSearchResult[];
}
