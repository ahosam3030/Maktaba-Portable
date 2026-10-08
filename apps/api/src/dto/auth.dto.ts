import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'أدخل كلمة المرور.' })
  @MaxLength(200)
  password!: string;
}

export class DeleteOrganizationPublicDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح.' })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @MinLength(1, { message: 'معرّف المكتبة مطلوب للتأكيد.' })
  confirmSlug!: string;
}
