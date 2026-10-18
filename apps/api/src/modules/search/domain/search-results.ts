export type SearchKind = 'clients' | 'projects' | 'proposals' | 'invoices';
export interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  archived: boolean;
}
export interface SearchGroup {
  kind: SearchKind;
  items: SearchItem[];
  hasMore: boolean;
}
