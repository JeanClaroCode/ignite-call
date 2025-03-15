import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log: ['query'], // para ver as inserções nos nossos bancos de dados
})
