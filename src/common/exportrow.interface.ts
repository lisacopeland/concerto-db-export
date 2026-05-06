import { RowDataPacket } from 'mysql2/promise';

export interface ExportRow extends RowDataPacket {
  [key: string]: unknown;

  name?: string;
  flow_test_name?: string;
  node_title?: string;
  port_name?: string;

  html?: string | null;
  js?: string | null;
  css?: string | null;
  code?: string | null;
  value?: string | null;
}

type ValidColumn = keyof Pick<ExportRow, 'html' | 'js' | 'css' | 'code' | 'value'>;

export function isValidColumn(value: string): value is ValidColumn {
  return ['html', 'js', 'css', 'code'].includes(value);
}
