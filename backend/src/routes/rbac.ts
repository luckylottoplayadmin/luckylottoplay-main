import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticate, requireAdmin, auditLog } from '../middleware/auth';
import crypto from 'crypto';

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  priority: z.number().int().min(0).max(1000).optional(),
}).strict();

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  priority: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
}).strict();

const cloneRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
}).strict();

const updatePermissionsSchema = z.object({
  permissionIds: z.array(z.string().min(1).max(100)).max(500),
}).strict();

const assignRoleSchema = z.object({
  roleId: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional().nullable(),
}).strict();

// CRIT-01 FIX: /rbac/* previously had zero authentication — any anonymous
// caller could enumerate roles and assign themselves SUPER_ADMIN via
// POST /rbac/users/:id/roles with no Authorization header.
// Fix: global preHandler hooks enforce authentication + admin authorization
// on every route in this file, exactly as admin.ts does.

export default async function rbacRoutes(app: FastifyInstance) {

  // All RBAC routes require a valid session AND admin/super-admin role.
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // ── Roles ─────────────────────────────────────────────────────────────

  // Get all roles with their assigned users count and permission count
  app.get('/', async (request, reply) => {
    try {
      const roles = await prisma.role.findMany({
        include: {
          _count: {
            select: { users: true, permissions: true },
          },
        },
        orderBy: { priority: 'desc' },
      });
      return { success: true, data: roles };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to fetch roles' });
    }
  });

  // Get single role details
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const role = await prisma.role.findUnique({
        where: { id: request.params.id },
        include: {
          permissions: {
            include: { permission: true },
          },
          users: {
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          },
        },
      });
      if (!role) {
        return reply.status(404).send({ success: false, message: 'Role not found' });
      }
      return { success: true, data: role };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to fetch role' });
    }
  });

  // Create new role
  app.post(
    '/',
    async (request, reply) => {
      const { name, description, department, priority } = createRoleSchema.parse(request.body);
      try {
        const role = await prisma.role.create({
          data: { name, description: description ?? undefined, department: department ?? undefined, priority: priority || 0 },
        });
        // CRIT-01: Audit log — was missing on all mutating routes
        await auditLog(request.user.userId, 'RBAC_ROLE_CREATED', 'Role', role.id, undefined, { name, department }, request)
        return { success: true, message: 'Role created', data: role };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ success: false, message: 'Failed to create role' });
      }
    }
  );

  // Update role
  app.patch<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const validatedData = updateRoleSchema.parse(request.body);
      try {
        const oldRole = await prisma.role.findUnique({ where: { id }, select: { name: true, department: true, isActive: true, priority: true } })
        const role = await prisma.role.update({
          where: { id },
          data: validatedData as any,
        });
        await auditLog(request.user.userId, 'RBAC_ROLE_UPDATED', 'Role', id, oldRole ?? undefined, validatedData, request)
        return { success: true, message: 'Role updated', data: role };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ success: false, message: 'Failed to update role' });
      }
    }
  );

  // Clone role
  app.post<{ Params: { id: string } }>(
    '/:id/clone',
    async (request, reply) => {
      const { id } = request.params;
      const { name } = cloneRoleSchema.parse(request.body);
      try {

        const sourceRole = await prisma.role.findUnique({
          where: { id },
          include: { permissions: true },
        });

        if (!sourceRole) {
          return reply.status(404).send({ success: false, message: 'Source role not found' });
        }

        const newRole = await prisma.role.create({
          data: {
            name,
            description: `Clone of ${sourceRole.name}`,
            department: sourceRole.department,
            priority: sourceRole.priority,
            permissions: {
              create: sourceRole.permissions.map(p => ({
                id: crypto.randomUUID(),
                permissionId: p.permissionId,
              })),
            },
          },
        });
        await auditLog(request.user.userId, 'RBAC_ROLE_CLONED', 'Role', newRole.id, { sourceRoleId: id }, { name }, request)
        return { success: true, message: 'Role cloned', data: newRole };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ success: false, message: 'Failed to clone role' });
      }
    }
  );

  // Delete role
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const role = await prisma.role.findUnique({ where: { id }, select: { name: true } })
      await prisma.role.delete({ where: { id } });
      await auditLog(request.user.userId, 'RBAC_ROLE_DELETED', 'Role', id, role ?? undefined, undefined, request)
      return { success: true, message: 'Role deleted' };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to delete role' });
    }
  });

  // ── Permissions ───────────────────────────────────────────────────────

  // Get all permissions
  app.get('/permissions', async (request, reply) => {
    try {
      const permissions = await prisma.permission.findMany({
        orderBy: [{ action: 'asc' }],
      });
      return { success: true, data: permissions };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Failed to fetch permissions' });
    }
  });

  // Bulk update permissions for a role
  app.post<{ Params: { id: string } }>(
    '/:id/permissions',
    async (request, reply) => {
      const { id } = request.params;
      const { permissionIds } = updatePermissionsSchema.parse(request.body);
      try {
        // Transaction to delete old and create new
        await prisma.$transaction([
          prisma.rolePermission.deleteMany({ where: { roleId: id } }),
          prisma.rolePermission.createMany({
            data: permissionIds.map(permId => ({
              id: crypto.randomUUID(),
              roleId: id,
              permissionId: permId,
            })),
          }),
        ]);

        await auditLog(request.user.userId, 'RBAC_PERMISSIONS_UPDATED', 'Role', id, undefined, { permissionIds }, request)
        return { success: true, message: 'Permissions updated successfully' };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ success: false, message: 'Failed to update permissions' });
      }
    }
  );

  // ── User Assignment ───────────────────────────────────────────────────

  // Assign a role to a user
  app.post<{ Params: { id: string } }>(
    '/users/:id/roles',
    async (request, reply) => {
      const { id: userId } = request.params;
      const { roleId, expiresAt } = assignRoleSchema.parse(request.body);
      try {

        const assignment = await prisma.userRoleMapping.upsert({
          where: {
            userId_roleId: { userId, roleId }
          },
          update: {
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
          create: {
            userId,
            roleId,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          }
        });

        await auditLog(request.user.userId, 'RBAC_ROLE_ASSIGNED', 'User', userId, undefined, { roleId, expiresAt }, request)
        return { success: true, message: 'Role assigned successfully', data: assignment };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ success: false, message: 'Failed to assign role' });
      }
    }
  );

  // Unassign a role from a user
  app.delete<{ Params: { id: string, roleId: string } }>(
    '/users/:id/roles/:roleId',
    async (request, reply) => {
      try {
        const { id: userId, roleId } = request.params;

        await prisma.userRoleMapping.delete({
          where: {
            userId_roleId: { userId, roleId }
          }
        });

        await auditLog(request.user.userId, 'RBAC_ROLE_UNASSIGNED', 'User', userId, { roleId }, undefined, request)
        return { success: true, message: 'Role removed successfully' };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ success: false, message: 'Failed to remove role' });
      }
    }
  );

}
