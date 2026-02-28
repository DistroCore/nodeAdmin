import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class JoinConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  conversationId!: string;
}
