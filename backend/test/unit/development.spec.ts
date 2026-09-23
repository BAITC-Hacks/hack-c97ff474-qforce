import { assertTransition, eligibility, growth, trajectory } from '../../src/modules/development/domain/policies';
import { DevelopmentContext, ActivityView } from '../../src/shared/domain/context';
const activity: ActivityView = { id:'A',title:'Course',description:'',type:'course',format:'self_paced',durationHours:2,mandatory:false,roleIds:['Engineer'],gradeIds:['L1'],effects:[{skillId:'design',gain:2,maxLevel:4}],prerequisites:{},upcomingSessions:[],repeatable:false,version:1 };
const context = (): DevelopmentContext => ({ employee:{id:'E',fullName:'Test',roleId:'Engineer',gradeId:'L1',department:'D',tenureMonths:2,preferredLanguage:'en',workFormat:'remote',hireDate:'2026-01-01',lastReviewDate:'2026-01-01',careerGoal:null,version:1},levels:{design:1,speaking:0},requirements:[{skillId:'design',requiredLevel:4,critical:true},{skillId:'speaking',requiredLevel:1,critical:false}],nextGradeId:'L2',skills:[],activities:[activity],history:[],stateVersion:1,historyVersion:1,feedbackVersion:1,catalogVersion:1,asOfDate:'2026-10-01' });
describe('development invariants', () => {
  it('caps fractional growth without reducing existing skill', () => {
    expect(growth(3.75,1,4)).toEqual({before:3.75,after:4,actualGain:.25});
    expect(growth(4.5,2,3)).toEqual({before:4.5,after:4.5,actualGain:0});
    expect(growth(4.5,2,5).after).toBe(5);
  });
  it('does not invent an unknown baseline', () => { expect(()=>growth(null,1,4)).toThrow('unknown'); expect(()=>growth(undefined,1,4)).toThrow('unknown'); });
  it('computes weighted readiness, gaps and critical requirements', () => { const value=trajectory(context()); expect(value.readinessPercent).toBe(20); expect(value.gaps[0].gap).toBe(3); expect(value.criticalSkillsMet).toBe(false); });
  it('reports data coverage, missing requirements and final grade explicitly', () => {
    const value=context(); value.levels.design=null; expect(trajectory(value)).toMatchObject({status:'DATA_INCOMPLETE',readinessPercent:null,coverage:.5});
    value.nextGradeId=null; expect(trajectory(value)).toMatchObject({status:'NO_NEXT_GRADE',readinessPercent:null});
    value.nextGradeId='L2'; value.requirements=[]; expect(trajectory(value)).toMatchObject({status:'NO_REQUIREMENTS',readinessPercent:null});
  });
  it('retains grade even when fully ready', () => { const value=context(); value.levels={design:5,speaking:1}; expect(trajectory(value)).toMatchObject({status:'READY',readinessPercent:100,currentGradeId:'L1'}); });
  it('enforces terminal states', () => { expect(()=>assertTransition('REGISTERED','completed')).not.toThrow(); for (const state of ['completed','declined','dropped','no_show']) expect(()=>assertTransition(state,'completed')).toThrow(); });
  it('filters audience, schedule, prerequisites, mandatory and repeated completion', () => {
    expect(eligibility(context(),activity).eligible).toBe(true);
    expect(eligibility(context(),{...activity,roleIds:['Analyst']}).reasons).toContain('ROLE_MISMATCH');
    expect(eligibility(context(),{...activity,format:'offline',upcomingSessions:['2026-09-30']}).reasons).toContain('NO_UPCOMING_SESSION');
    expect(eligibility(context(),{...activity,prerequisites:{design:2}}).reasons).toContain('PREREQUISITES_NOT_MET');
    expect(eligibility(context(),{...activity,mandatory:true}).reasons).toContain('MANDATORY_ACTIVITY');
    const value=context(); value.history=[{id:'P',employeeId:'E',activityId:'A',date:'2026-01-01',status:'COMPLETED',completionPct:100,assignedBy:'self',source:'import'}];
    expect(eligibility(value,activity).reasons).toContain('ALREADY_COMPLETED');
    expect(eligibility(value,{...activity,repeatable:true}).eligible).toBe(true);
  });
  it('refuses useless capped activities and active registrations', () => {
    expect(eligibility(context(),{...activity,effects:[{skillId:'design',gain:1,maxLevel:1}]}).reasons).toContain('NO_RELEVANT_GAIN');
    const value=context(); value.history=[{id:'P',employeeId:'E',activityId:'A',date:'2026-10-01',status:'registered',completionPct:0,assignedBy:'self',source:'online'}];
    expect(eligibility(value,activity).reasons).toContain('ALREADY_ACTIVE');
  });
});
