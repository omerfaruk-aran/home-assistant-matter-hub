import type { EntityMappingRequest } from "@home-assistant-matter-hub/common";
import express from "express";
import type { EntityMappingStorage } from "../services/storage/entity-mapping-storage.js";

export function entityMappingApi(
  mappingStorage: EntityMappingStorage,
): express.Router {
  const router = express.Router();

  router.get("/:bridgeId", (req, res) => {
    const { bridgeId } = req.params;
    const mappings = mappingStorage.getMappingsForBridge(bridgeId);
    res.status(200).json({ bridgeId, mappings });
  });

  router.get("/:bridgeId/:entityId", (req, res) => {
    const { bridgeId, entityId } = req.params;
    const mapping = mappingStorage.getMapping(bridgeId, entityId);
    if (mapping) {
      res.status(200).json(mapping);
    } else {
      res.status(404).json({ error: "Mapping not found" });
    }
  });

  router.put("/:bridgeId/:entityId", async (req, res) => {
    const { bridgeId, entityId } = req.params;
    const body = req.body as Partial<EntityMappingRequest>;

    const request: EntityMappingRequest = {
      bridgeId,
      entityId,
      matterDeviceType: body.matterDeviceType,
      customName: body.customName,
      disabled: body.disabled,
      filterLifeEntity: body.filterLifeEntity,
      cleaningModeEntity: body.cleaningModeEntity,
      humidityEntity: body.humidityEntity,
      batteryEntity: body.batteryEntity,
      roomEntities: body.roomEntities,
      disableLockPin: body.disableLockPin,
    };

    const config = await mappingStorage.setMapping(request);
    res.status(200).json(config);
  });

  router.delete("/:bridgeId/:entityId", async (req, res) => {
    const { bridgeId, entityId } = req.params;
    await mappingStorage.deleteMapping(bridgeId, entityId);
    res.status(204).send();
  });

  router.delete("/:bridgeId", async (req, res) => {
    const { bridgeId } = req.params;
    await mappingStorage.deleteBridgeMappings(bridgeId);
    res.status(204).send();
  });

  return router;
}
