import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

const ROLES = [
  "KINDERGARTEN_MANAGER",
  "FIELD_MONITOR",
  "COUNCIL_MEMBER",
  "DISTRICT_EDUCATION",
] as const;

export class CreateKindergartenDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  educationDirectorateId?: string;
}

export class UpdateKindergartenDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nameCkb?: string;

  @IsOptional()
  @IsString()
  educationDirectorateId?: string;
}

export class CreatePlatformUserDto {
  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(ROLES)
  role!: (typeof ROLES)[number];

  @IsOptional()
  @IsUUID()
  kindergartenId?: string;

  @IsOptional()
  @IsString()
  educationDirectorateId?: string;
}
