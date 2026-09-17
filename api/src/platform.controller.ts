import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { eq, ilike, or } from "drizzle-orm";
import { formSubmissions, kindergartens, userSiteAssignments, users } from "../../src/db/schema";
import type { AuthenticatedRequest } from "./auth/roles.guard";
import { RequirePermissions } from "./auth/roles.decorator";
import { hashPassword } from "./auth/session";
import { DatabaseService } from "./database.service";
import { canAccessKindergarten, canSubmitForm } from "../../src/lib/rbac";
import {
  CreateKindergartenDto,
  CreatePlatformUserDto,
  UpdateKindergartenDto,
} from "./dto/platform.dto";

@Controller("platform")
export class PlatformController {
  constructor(private readonly database: DatabaseService) {}

  @Get("state")
  @RequirePermissions("sites.read.assigned")
  async state(@Req() req: AuthenticatedRequest) {
    if (!this.database.isConfigured()) throw new ServiceUnavailableException("DATABASE_URL is not set");
    const actor = req.user!;
    const sites = await this.database.client.select().from(kindergartens);
    const visibleSites = actor.role === "SUPER_ADMIN"
      ? sites
      : sites.filter((site) => actor.assignedKindergartenIds.includes(site.id) || site.id === actor.homeKindergartenId);
    return { kindergartens: visibleSites, actor };
  }

  @Post("kindergartens")
  @RequirePermissions("sites.write.assigned")
  async createKindergarten(@Body() dto: CreateKindergartenDto) {
    if (!this.database.isConfigured()) throw new ServiceUnavailableException("DATABASE_URL is not set");
    const all = await this.database.client.select({ code: kindergartens.code }).from(kindergartens);
    const used = new Set(all.map((row) => row.code));
    let n = all.length + 1;
    let code = `KG-${String(n).padStart(2, "0")}`;
    while (used.has(code)) code = `KG-${String(++n).padStart(2, "0")}`;
    const [site] = await this.database.client.insert(kindergartens).values({
      code,
      nameEn: dto.name.trim(),
      nameAr: dto.name.trim(),
      nameCkb: dto.name.trim(),
      educationDirectorateId: dto.educationDirectorateId?.trim() || null,
    }).returning();
    return site;
  }

  @Patch("kindergartens/:id")
  @RequirePermissions("sites.write.assigned")
  async updateKindergarten(@Param("id") id: string, @Body() dto: UpdateKindergartenDto) {
    if (!this.database.isConfigured()) throw new ServiceUnavailableException("DATABASE_URL is not set");
    const [site] = await this.database.client.update(kindergartens).set({
      ...(dto.nameEn === undefined ? {} : { nameEn: dto.nameEn.trim() }),
      ...(dto.nameAr === undefined ? {} : { nameAr: dto.nameAr.trim() }),
      ...(dto.nameCkb === undefined ? {} : { nameCkb: dto.nameCkb.trim() }),
      ...(dto.educationDirectorateId === undefined ? {} : { educationDirectorateId: dto.educationDirectorateId.trim() || null }),
      updatedAt: new Date(),
    }).where(eq(kindergartens.id, id)).returning();
    if (!site) throw new NotFoundException("Kindergarten not found");
    return site;
  }

  @Delete("kindergartens/:id")
  @RequirePermissions("sites.write.assigned")
  async deleteKindergarten(@Param("id") id: string) {
    if (!this.database.isConfigured()) throw new ServiceUnavailableException("DATABASE_URL is not set");
    const [site] = await this.database.client.delete(kindergartens).where(eq(kindergartens.id, id)).returning({ id: kindergartens.id });
    if (!site) throw new NotFoundException("Kindergarten not found");
    return { id: site.id };
  }

  @Post("users")
  @RequirePermissions("users.manage.global")
  async createUser(@Body() dto: CreatePlatformUserDto) {
    if (!this.database.isConfigured()) throw new ServiceUnavailableException("DATABASE_URL is not set");
    const email = dto.displayName.trim().toLowerCase().replace(/\s+/g, ".") + "@unicef.local";
    const existing = await this.database.client.select({ id: users.id }).from(users).where(or(eq(users.email, email), ilike(users.displayName, dto.displayName.trim()))).limit(1);
    if (existing.length) throw new ConflictException("User already exists");
    const [user] = await this.database.client.insert(users).values({
      email,
      passwordHash: hashPassword(dto.password),
      displayName: dto.displayName.trim(),
      role: dto.role,
      kindergartenId: dto.kindergartenId ?? null,
      educationDirectorateId: dto.educationDirectorateId?.trim() || null,
    }).returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, kindergartenId: users.kindergartenId, educationDirectorateId: users.educationDirectorateId });
    if (dto.kindergartenId) {
      await this.database.client.insert(userSiteAssignments).values({ userId: user.id, kindergartenId: dto.kindergartenId }).onConflictDoNothing();
    }
    return user;
  }

  @Post("submissions")
  @RequirePermissions("sites.read.assigned")
  async createSubmission(@Req() req: AuthenticatedRequest, @Body() body: {
    kindergartenId: string;
    formCode: "FORM_1" | "FORM_2";
    form1Answers?: Record<string, string>;
    form2Plans?: Record<string, Record<string, string>>;
  }) {
    const actor = req.user!;
    if (!canAccessKindergarten(actor, body.kindergartenId) || !canSubmitForm(actor.role, body.formCode)) {
      throw new NotFoundException("Kindergarten not found");
    }
    const [submission] = await this.database.client.insert(formSubmissions).values({
      kindergartenId: body.kindergartenId,
      formCode: body.formCode,
      academicYear: process.env.ACADEMIC_YEAR ?? "2026/2027",
      assessorId: actor.id,
      status: "SUBMITTED",
      submittedAt: new Date(),
      sectionScores: { form1Answers: body.form1Answers ?? {}, form2Plans: body.form2Plans ?? {} },
    }).returning();
    return submission;
  }
}
