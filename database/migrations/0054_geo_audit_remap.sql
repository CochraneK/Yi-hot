-- A tightening or loosening rule can move a verified candidate to a different
-- place without rejecting it: 浦东新区 used to stand for itself, now it is 上海,
-- and 朝阳区 must stop resolving to 朝阳市. The audit trail needs a word for that
-- move — the alternatives are recording it as a second 'approve' (a lie) or
-- leaving no trace of why a pin changed city.
ALTER TABLE geo_review_audit DROP CONSTRAINT geo_review_audit_action_check;
ALTER TABLE geo_review_audit ADD CONSTRAINT geo_review_audit_action_check
  CHECK (action IN ('approve', 'reject', 'reopen', 'remap'));
