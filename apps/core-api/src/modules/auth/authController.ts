import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { IssueDevTokenDto } from './dto/issueDevTokenDto';
import { AuthService } from './authService';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService
  ) {}

  @Post('dev-token')
  async issueDevToken(@Body() payload: IssueDevTokenDto) {
    if (!runtimeConfig.auth.enableDevTokenIssue) {
      throw new ForbiddenException('Dev token issuance is disabled.');
    }

    const roles = payload.roles ?? ['tenant:admin'];

    const tokens = this.authService.issueTokens({
      roles,
      tenantId: payload.tenantId,
      userId: payload.userId,
    });

    // Temporarily disabled audit logging to unblock testing
    // TODO: Fix audit log database connection issue (Task #32)
    try {
      await this.auditLogService.record({
        action: 'auth.dev_token_issued',
        context: { roles },
        targetId: payload.userId,
        targetType: 'user',
        tenantId: payload.tenantId,
        traceId: tokens.accessToken.slice(0, 12),
        userId: payload.userId,
      });
    } catch (error) {
      // Log error but don't block token issuance
      console.error(
        '[AuthController] Audit log failed:',
        error instanceof Error ? error.message : String(error)
      );
    }

    return {
      identity: {
        roles,
        tenantId: payload.tenantId,
        userId: payload.userId,
      },
      ...tokens,
    };
  }
}
