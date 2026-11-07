// Application-page helpers (Track B).
import { getDoc } from '../db.js';
import { find } from '../services.js';
import { HttpError } from '../functions.js';
import { isInternal } from '../rls.js';

// Company-facing actions; internal-only steps (calculation, escalation, assignment) are hidden.
const COMPANY_VISIBLE = ['submit', 'resubmit', 'start_review', 'return_application', 'approve', 'forward_to_accounts', 'complete'];
const COMMENTS_VISIBLE = ['return_application', 'approve', 'complete'];

export const functions = {
  async applicationHistory(user, { application_id }) {
    const app = getDoc('ContributionApplication', application_id);
    if (!app) throw new HttpError(404, 'The requested application could not be found.');
    const internal = isInternal(user);
    if (!internal && !(user.company_id && user.company_id === app.company_id)) throw new HttpError(403, 'You do not have permission to access this record.');
    return find('ApprovalHistory', { application_id })
      .filter((h) => internal || COMPANY_VISIBLE.includes(h.action))
      .sort((a, b) => String(b.action_date || b.created_date).localeCompare(String(a.action_date || a.created_date)))
      .map((h) => ({
        id: h.id, action: h.action, previous_status: h.previous_status, new_status: h.new_status,
        date: h.action_date || h.created_date,
        by: internal ? h.action_by_name : (['submit', 'resubmit'].includes(h.action) ? h.action_by_name : 'Contributions Unit'),
        comments: internal || COMMENTS_VISIBLE.includes(h.action) ? h.comments || '' : '',
      }));
  },
};
