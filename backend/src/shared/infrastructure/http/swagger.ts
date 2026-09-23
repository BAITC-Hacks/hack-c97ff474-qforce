import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z, ZodType } from 'zod';
export function ApiZodResponse(schema: ZodType, status = 200, paginated = false) {
  const meta = paginated ? z.object({requestId:z.string(),page:z.number().int(),pageSize:z.number().int(),total:z.number().int()}) : z.object({requestId:z.string()});
  const convert = zodToJsonSchema as (value: unknown, options: { target: 'openApi3'; $refStrategy:'none' }) => unknown;
  return ApiResponse({status,schema:convert(z.object({data:schema,meta}),{target:'openApi3',$refStrategy:'none'}) as SchemaObject});
}
export function ApiZodBody(schema: ZodType) {
  const convert = zodToJsonSchema as (value: unknown, options: { target: 'openApi3'; $refStrategy:'none' }) => unknown;
  const json = convert(schema, { target: 'openApi3', $refStrategy:'none' }) as SchemaObject;
  return applyDecorators(ApiBody({ schema: json }));
}
export function ApiErrors() {
  return applyDecorators(...[400,401,403,404,409,422,429,503].map(status => ApiResponse({ status, description: 'Request error', schema: { type: 'object', required:['code','message','details','requestId'], properties: { code: {type:'string'},message:{type:'string'},details:{nullable:true},requestId:{type:'string'} } } })));
}
