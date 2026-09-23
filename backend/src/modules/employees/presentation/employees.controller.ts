import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { EmployeeService } from '../application/employee.service';
import { Roles } from '../../identity-access/public-http';
import { ApiErrors, ApiZodResponse } from '../../../shared/infrastructure/http/swagger';
import { employeeListItemSchema } from './employees.dto';
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), roleId: z.string().optional(), gradeId: z.string().optional(), department: z.string().optional(), search:z.string().trim().max(200).optional() });
@ApiTags('employees')
@ApiBearerAuth()
@ApiErrors()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeeService) {}
  @Get()
  @Roles('HR')
  @ApiZodResponse(z.array(employeeListItemSchema), 200, true)
  @ApiOperation({summary: 'List employees with exact role, grade and department filters; stable employee ID ordering'})
  @ApiQuery({name: 'page', required: false, schema: {type: 'integer', minimum: 1, default: 1}})
  @ApiQuery({name: 'pageSize', required: false, schema: {type: 'integer', minimum: 1, maximum: 100, default: 20}})
  @ApiQuery({name:'search',required:false,type:String,description:'Case-insensitive substring of employee ID or display name'})
  @ApiQuery({name: 'roleId', required: false, type: String}) @ApiQuery({name: 'gradeId', required: false, type: String}) @ApiQuery({name: 'department', required: false, type: String})
  list(@Query() query: Record<string, string>) { return this.employees.list(querySchema.parse(query)); }
}
