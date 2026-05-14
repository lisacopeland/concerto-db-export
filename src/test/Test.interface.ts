import type { RowDataPacket } from 'mysql2/promise';

export interface Test {
  id?: number;
  owner_id: number | null;
  name: string;
  description: string;
  visibility: number;
  type: number;
  code: string | null;
  slug: string;
  configOverride: string | null;
  protected: boolean;
  updated: Date;
  updatedBy: string;
  created: Date;
  accessibility: number;
  groups: string;
  archived: boolean;
  starterContent: boolean;
  tags: string;
  sourceWizard_id: number | null;
  baseTemplate_id: number | null;
  directLockBy_id: number | null;
}

export interface TestRow extends Test, RowDataPacket {}
