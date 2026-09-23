import { EmployeeAccountService } from '../../src/modules/identity-access/application/employee-account.service';
import { RandomAccountSecrets } from '../../src/modules/identity-access/infrastructure/employee-accounts';
describe('employee account provisioning',()=>{
  test('HR receives credentials once and only a hash is passed to persistence',async()=>{
    const create=jest.fn(async()=> 'created' as const);
    const secrets={generate:()=>({username:'generated-user',password:'ephemeral-secret'}),hash:jest.fn(async()=> 'hashed-secret')};
    const service=new EmployeeAccountService({create},secrets);
    await expect(service.provision({id:'hr',role:'HR',employeeId:null},'imported-person')).resolves.toEqual({employeeId:'imported-person',username:'generated-user',password:'ephemeral-secret'});
    expect(create).toHaveBeenCalledWith('imported-person','generated-user','hashed-secret');
    await expect(service.provision({id:'employee',role:'EMPLOYEE',employeeId:'imported-person'},'another')).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(create).toHaveBeenCalledTimes(1);
  });
  test.each([['exists','ACCOUNT_EXISTS'],['missing','NOT_FOUND']] as const)('never resets accounts on %s',async(status,code)=>{
    const service=new EmployeeAccountService({create:async()=>status},{generate:()=>({username:'generated',password:'ephemeral'}),hash:async()=> 'hash'});
    await expect(service.provision({id:'hr',role:'HR',employeeId:null},'person')).rejects.toMatchObject({code});
  });
  test('generates independent random credentials rather than profile-derived passwords',()=>{
    const source=new RandomAccountSecrets(),a=source.generate(),b=source.generate();
    expect(a.username).not.toBe(b.username);expect(a.password).not.toBe(b.password);
    expect(a.password).toHaveLength(32);expect(a.username.length).toBeLessThan(128);
  });
});
