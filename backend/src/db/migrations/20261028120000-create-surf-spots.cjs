'use strict';

// Creates the "surf_spots" table: the shared list of named surf spots that
// surfers can choose as favourites (and, later, set their availability at).
//
// - id is a stable text key such as 'pt-cascais-carcavelos'. The frontend
//   already uses these keys, so the same value works on both sides.
//   Never change an existing id once it is in use.
// - Spots are named places only. Sesh stores no coordinates and never
//   tracks a surfer's live location.
//
// The table starts with the initial sample of 29 Portuguese spots (copied
// from frontend/src/data/surfSpots.js on 28 Oct 2026). It is not an exhaustive
// list. New spots should be added in a new migration, not by editing this one.
//
// Everything runs in one transaction, so a failure leaves the database unchanged.

const SPOTS = [
  { id: 'pt-almada-sao-joao-da-caparica', name: 'Praia de São João da Caparica', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: 'Portugal' },
  { id: 'pt-almada-cds', name: 'Praia do CDS', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: 'Portugal' },
  { id: 'pt-almada-castelo', name: 'Praia do Castelo', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: 'Portugal' },
  { id: 'pt-almada-fonte-da-telha', name: 'Praia da Fonte da Telha', kind: 'beach', area: 'Costa da Caparica', municipality: 'Almada', region: 'Setúbal', country: 'Portugal' },
  { id: 'pt-cascais-carcavelos', name: 'Praia de Carcavelos', kind: 'beach', area: 'Carcavelos', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-cascais-sao-pedro-do-estoril', name: 'Praia de São Pedro do Estoril', kind: 'beach', area: 'São Pedro do Estoril', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-cascais-guincho', name: 'Praia do Guincho', kind: 'beach', area: 'Guincho', municipality: 'Cascais', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-sintra-praia-grande', name: 'Praia Grande', kind: 'beach', area: 'Colares', municipality: 'Sintra', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-mafra-ribeira-dilhas', name: 'Ribeira d’Ilhas', kind: 'beach', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-mafra-coxos', name: 'Coxos', kind: 'break', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-mafra-sao-lourenco', name: 'São Lourenço', kind: 'break', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-mafra-pedra-branca', name: 'Pedra Branca', kind: 'break', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-mafra-foz-do-lizandro', name: 'Praia da Foz do Lizandro', kind: 'beach', area: 'Ericeira', municipality: 'Mafra', region: 'Lisbon', country: 'Portugal' },
  { id: 'pt-peniche-supertubos', name: 'Supertubos', kind: 'break', area: 'Peniche', municipality: 'Peniche', region: 'Leiria', country: 'Portugal' },
  { id: 'pt-peniche-molhe-leste', name: 'Molhe Leste', kind: 'break', area: 'Peniche', municipality: 'Peniche', region: 'Leiria', country: 'Portugal' },
  { id: 'pt-peniche-baleal', name: 'Praia do Baleal', kind: 'beach', area: 'Baleal', municipality: 'Peniche', region: 'Leiria', country: 'Portugal' },
  { id: 'pt-nazare-praia-do-norte', name: 'Praia do Norte', kind: 'beach', area: 'Nazaré', municipality: 'Nazaré', region: 'Leiria', country: 'Portugal' },
  { id: 'pt-figueira-buarcos', name: 'Buarcos', kind: 'beach', area: 'Buarcos', municipality: 'Figueira da Foz', region: 'Coimbra', country: 'Portugal' },
  { id: 'pt-figueira-cabedelo', name: 'Praia do Cabedelo', kind: 'beach', area: 'Figueira da Foz', municipality: 'Figueira da Foz', region: 'Coimbra', country: 'Portugal' },
  { id: 'pt-espinho-espinho', name: 'Praia de Espinho', kind: 'beach', area: 'Espinho', municipality: 'Espinho', region: 'Aveiro', country: 'Portugal' },
  { id: 'pt-matosinhos-matosinhos', name: 'Praia de Matosinhos', kind: 'beach', area: 'Matosinhos', municipality: 'Matosinhos', region: 'Porto', country: 'Portugal' },
  { id: 'pt-viana-cabedelo', name: 'Praia do Cabedelo', kind: 'beach', area: 'Viana do Castelo', municipality: 'Viana do Castelo', region: 'Viana do Castelo', country: 'Portugal' },
  { id: 'pt-aljezur-arrifana', name: 'Praia da Arrifana', kind: 'beach', area: 'Arrifana', municipality: 'Aljezur', region: 'Faro (Algarve)', country: 'Portugal' },
  { id: 'pt-aljezur-amoreira', name: 'Praia da Amoreira', kind: 'beach', area: 'Aljezur', municipality: 'Aljezur', region: 'Faro (Algarve)', country: 'Portugal' },
  { id: 'pt-aljezur-amado', name: 'Praia do Amado', kind: 'beach', area: 'Carrapateira', municipality: 'Aljezur', region: 'Faro (Algarve)', country: 'Portugal' },
  { id: 'pt-vila-do-bispo-castelejo', name: 'Praia do Castelejo', kind: 'beach', area: 'Vila do Bispo', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: 'Portugal' },
  { id: 'pt-vila-do-bispo-cordoama', name: 'Praia da Cordoama', kind: 'beach', area: 'Vila do Bispo', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: 'Portugal' },
  { id: 'pt-vila-do-bispo-tonel', name: 'Praia do Tonel', kind: 'beach', area: 'Sagres', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: 'Portugal' },
  { id: 'pt-vila-do-bispo-beliche', name: 'Praia do Beliche', kind: 'beach', area: 'Sagres', municipality: 'Vila do Bispo', region: 'Faro (Algarve)', country: 'Portugal' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        'surf_spots',
        {
          id: {
            type: Sequelize.STRING(100),
            primaryKey: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          // 'beach' (a named beach) or 'break' (a named surf break or reef)
          kind: {
            type: Sequelize.STRING(10),
            allowNull: false,
          },
          area: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          municipality: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          region: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          country: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction },
      );

      await queryInterface.addConstraint('surf_spots', {
        type: 'check',
        fields: ['kind'],
        where: { kind: ['beach', 'break'] },
        name: 'surf_spots_kind_check',
        transaction,
      });

      await queryInterface.bulkInsert('surf_spots', SPOTS, { transaction });
    });
  },

  async down(queryInterface) {
    // Fails while surfer_favorite_spots still references spots, which is
    // intended: undo the surfer profiles migration first.
    await queryInterface.dropTable('surf_spots');
  },
};
