import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsNumber({}, { message: 'الكمية يجب أن تكون رقمًا.' })
  @Min(0.001, { message: 'الكمية يجب أن تكون أكبر من صفر.' })
  quantity!: number;

  @IsNumber({}, { message: 'سعر البيع يجب أن يكون رقمًا.' })
  @Min(0, { message: 'سعر البيع لا يكون سالبًا.' })
  unitPrice!: number;
}

export class CreateSaleDto {
  @IsString()
  @MaxLength(80)
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  saleDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'أضف بندًا واحدًا على الأقل.' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}
