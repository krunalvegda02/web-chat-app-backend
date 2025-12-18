export const welcomeEmailTemplate = (name, tenantName) => `
<div style="background: linear-gradient(to right, #e0f2fe, #e0e7ff); padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
    
    <h1 style="color: #1e293b; margin-bottom: 8px;">Welcome to ${tenantName || 'Chat App'}! 👋</h1>
    <p style="color: #64748b; margin-bottom: 24px;">Hi ${name}, your account has been created successfully!</p>
    
    <div style="background: linear-gradient(to right, #06b6d4, #3b82f6); border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
      <p style="color: white; font-size: 18px; font-weight: 600; margin: 0;">🎉 You're all set!</p>
      <p style="color: rgba(255,255,255,0.9); margin-top: 8px;">Start chatting with your team now</p>
    </div>
    
    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h3 style="color: #1e293b; margin-top: 0; margin-bottom: 12px;">Quick Start Guide:</h3>
      <ul style="color: #64748b; line-height: 1.8; margin: 0; padding-left: 20px;">
        <li>Complete your profile</li>
        <li>Join chat rooms</li>
        <li>Start conversations</li>
      </ul>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    
    <p style="color: #64748b; font-size: 12px; text-align: center;">
      If you have any questions, feel free to reach out to our support team.
    </p>
  </div>
</div>
`;

export const inviteEmailTemplate = (tenantName, inviteUrl) => `
<div style="background: linear-gradient(to right, #e0f2fe, #e0e7ff); padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
    
    <h1 style="color: #1e293b; margin-bottom: 8px;">Welcome to ${tenantName}! 👋</h1>
    <p style="color: #64748b; margin-bottom: 24px;">You've been invited to join our workspace</p>
    
    <div style="background: linear-gradient(to right, #06b6d4, #3b82f6); border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
      <a href="${inviteUrl}" style="display: inline-block; background: white; color: #0369a1; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">
        Accept Invitation
      </a>
    </div>
    
    <p style="color: #64748b; font-size: 14px; margin-bottom: 8px;">Or copy this link:</p>
    <code style="background: #f1f5f9; padding: 12px; border-radius: 6px; display: block; word-break: break-all; color: #0f172a;">
      ${inviteUrl}
    </code>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    
    <p style="color: #64748b; font-size: 12px;">
      This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.
    </p>
  </div>
</div>
`;
