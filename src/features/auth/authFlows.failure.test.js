import {it,expect,vi} from 'vitest';
import {confirmEmailWithCode,resendEmailConfirmation,requestPasswordRecovery,updateAndVerifyPassword,clearForcedPasswordReset,redeemPatientInvite,confirmationRetryAfterMs,isExpectedLoginRejection,isExpectedPasswordRejection,isExpectedConfirmationRejection,validateNewPassword} from './authFlows';
it('preserves provider failures across confirmation, recovery and invitation flows',async()=>{
 const error=Error('provider unavailable');
 const auth={resend:vi.fn().mockResolvedValue({error}),verifyOtp:vi.fn().mockResolvedValue({error}),resetPasswordForEmail:vi.fn().mockResolvedValue({error}),updateUser:vi.fn().mockResolvedValue({error})};
 await expect(resendEmailConfirmation({auth},'a@b.com','https://nello.example')).rejects.toBe(error);
 await expect(confirmEmailWithCode({auth},'a@b.com','123456')).rejects.toBe(error);
 await expect(requestPasswordRecovery({auth},'a@b.com','https://nello.example')).rejects.toBe(error);
 await expect(updateAndVerifyPassword({auth},{session:{user:{id:'a',email:'a@b.com'}},password:'12345678'})).rejects.toBe(error);
 await expect(redeemPatientInvite({rpc:async()=>({error})},'ABCD-2345')).rejects.toBe(error);
 await expect(clearForcedPasswordReset({from:()=>({update:()=>({eq:async()=>({error})})})},'a')).rejects.toBe(error);
});
it('refuses missing input before sending provider requests',async()=>{
 for(const fn of [resendEmailConfirmation,requestPasswordRecovery])await expect(fn({},'', 'https://nello.example')).rejects.toThrow('e-mail válido');
 await expect(confirmEmailWithCode({},'',null)).rejects.toThrow('e-mail do cadastro');
 await expect(confirmEmailWithCode({},'a@b.com',null)).rejects.toThrow('6 números');
 await expect(redeemPatientInvite({},null)).rejects.toThrow('código');
 await expect(clearForcedPasswordReset({},null)).resolves.toBeUndefined();
 expect(validateNewPassword('x'.repeat(73))).toContain('72 caracteres');
});
it('handles legacy error shapes and HTTP-date retry headers',()=>{
 expect(isExpectedLoginRejection()).toBe(false);expect(isExpectedPasswordRejection()).toBe(false);expect(isExpectedConfirmationRejection()).toBe(false);
 expect(isExpectedLoginRejection({statusCode:400,message:'User banned'})).toBe(true);
 expect(isExpectedPasswordRejection({statusCode:422,message:'New password should be different'})).toBe(true);
 expect(isExpectedConfirmationRejection({statusCode:400,code:'otp_expired'})).toBe(true);
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
 expect(confirmationRetryAfterMs({headers:{'retry-after':'Wed, 30 Sep 2026 12:02:00 GMT'}})).toBe(120000);
 expect(confirmationRetryAfterMs({headers:{'retry-after':'Wed, 30 Sep 2026 11:00:00 GMT'}},1234)).toBe(1234);vi.useRealTimers();
});
it('decodes legacy invite responses without discarding malformed-response errors',async()=>{
 await expect(redeemPatientInvite({rpc:async()=>({data:'{"success":true}'})},'ABCD-2345')).resolves.toEqual({success:true});
 await expect(redeemPatientInvite({rpc:async()=>({data:'bad json'})},'ABCD-2345')).rejects.toBeInstanceOf(SyntaxError);
});
