export interface GenerateWebsiteRequest {
  businessSearchResultId: string;
}

export interface GeneratedWebsite {
  id: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string | null;
  generatedContent: string;
  auditSummary: string | null;
  sourceWebsiteUrl: string | null;
  createdAt: string;
}
