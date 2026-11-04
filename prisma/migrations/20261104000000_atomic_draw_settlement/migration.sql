CREATE TABLE "draw_settlements" (
  "drawId" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "draw_settlements_pkey" PRIMARY KEY ("drawId"),
  CONSTRAINT "draw_settlements_drawId_fkey" FOREIGN KEY ("drawId")
    REFERENCES "draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
