import { RowDataPacket } from 'mysql2';

export interface EasiSession extends RowDataPacket {
  id: number;
  participant_id: number;
  participantMonths: number | null;
  timeCreated: Date;
  timeStarted: Date | null;
  timeFinished: Date | null;
  dateAssessment: Date | null;
  statusDescription: string | null;
  status: number;
  token: string;
  admin_id: number | null;
  testIteration: number | null;
}
