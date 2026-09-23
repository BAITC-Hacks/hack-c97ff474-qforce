import { eligibility, trajectory } from '../../development/public';
import { DevelopmentPolicies } from '../domain/policies/ranking.policy';

export const developmentPolicies: DevelopmentPolicies = {
  eligibility,
  changes: (context, activity) => eligibility(context, activity).expectedSkillChanges,
  readiness: context => trajectory(context).readinessPercent,
};
