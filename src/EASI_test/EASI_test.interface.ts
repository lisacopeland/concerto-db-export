import { RowDataPacket } from 'mysql2';

export interface EasiTest extends RowDataPacket {
  id: number;

  code: string;
  title: string;
  title_es: string | null;

  instructionsFile: string | null;
  instructionsTranscript: string | null;

  itemsPerPage: number | null;

  canGoBack: boolean;

  itemSelectionAlgo: string | null;
  scoringAlgo: string | null;
  stopAlgo: string | null;

  feedbackInfo: string | null;

  orderIndex: number;

  autoNominate: boolean;
  autoInvitationEmail: boolean;
  allowManualInvitationEmail: boolean;

  invitationEmailBody: string | null;
  invitationEmailSubject: string | null;

  invitationEmailBody_es: string | null;
  invitationEmailSubject_es: string | null;

  returnToPanel: boolean;

  hiddenScores: unknown | null;
  summaryScores: unknown | null;

  completedEmail: boolean;

  completedEmailBody: string | null;
  completedEmailSubject: string | null;

  completedEmailBody_es: string | null;
  completedEmailSubject_es: string | null;
}
