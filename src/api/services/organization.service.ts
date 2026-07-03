import prisma from '../../shared/db';
import { NotFoundError } from '../../shared/errors';

export class OrganizationService {
  /** List organizations the user belongs to */
  async listForUser(userId: string) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            _count: { select: { members: true, projects: true } },
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.organization,
      role: m.role,
      memberCount: m.organization._count.members,
      projectCount: m.organization._count.projects,
    }));
  }

  /** Create an organization and make the creating user the owner */
  async create(name: string, userId: string) {
    return prisma.organization.create({
      data: {
        name,
        members: {
          create: {
            userId,
            role: 'owner',
          },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
  }

  /** Get a single organization (validates membership) */
  async getById(id: string, userId: string) {
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, name: true, role: true } },
          },
        },
        projects: true,
        _count: { select: { members: true, projects: true } },
      },
    });

    if (!org) {
      throw new NotFoundError('Organization', id);
    }

    // Verify the requesting user is a member
    const isMember = org.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new NotFoundError('Organization', id);
    }

    return org;
  }
}

export const organizationService = new OrganizationService();
