import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TypingStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  conversationId!: string;

  @IsBoolean()
  isTyping!: boolean;
}
