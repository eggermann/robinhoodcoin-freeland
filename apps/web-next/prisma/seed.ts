import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const records = [
    {
      externalId: "LAND-MM418QHX",
      title: "5 Acres 10 min to Los Lunas!",
      location: "Los Lunas, New Mexico, United States",
      country: "US",
      sizeAcres: 5,
      priceUsd: 13000,
      score: 88,
      sourceUrl: "https://www.landwatch.com/valencia-county-new-mexico-farms-and-ranches-for-sale/pid/425163034",
      teaserImage: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
    },
    {
      externalId: "LAND-MM418QFJ",
      title: "5 Ac With Power! Near town!",
      location: "Red Hill, New Mexico, United States",
      country: "US",
      sizeAcres: 5.68,
      priceUsd: 11900,
      score: 81,
      sourceUrl: "https://www.landwatch.com/catron-county-new-mexico-farms-and-ranches-for-sale/pid/424715441",
      teaserImage: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
    },
  ];

  for (const record of records) {
    await prisma.parcel.upsert({
      where: { externalId: record.externalId },
      update: record,
      create: record,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
