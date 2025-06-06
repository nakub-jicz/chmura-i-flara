import { PrismaClient } from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";

const prisma = (DATABASE_URL?: string) =>
  new PrismaClient({
    datasourceUrl: DATABASE_URL,
  }).$extends(withAccelerate());

export default prisma;
