import type { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface ViewTemplate {
  id?: number | null;
  owner_id?: number | null;
  name?: string | null;
  description: string;
  head: string;
  css: string;
  js: string;
  html: string;
  updated: Date | string;
  updatedBy?: string | null;
  created: Date | string;
  accessibility?: number | null;
  groups?: string | null;
  archived?: boolean | number | null;
  starterContent?: boolean | number | null;
  tags?: string | null;
  directLockBy_id?: number | null;
}

export interface ViewTemplateRow extends ViewTemplate, RowDataPacket {}
