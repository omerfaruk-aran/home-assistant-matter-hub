import {
  type MediaPlayerDeviceAttributes,
  MediaPlayerDeviceFeature,
} from "@home-assistant-matter-hub/common";
import { Logger } from "@matter/general";
import { KeypadInputServer as Base } from "@matter/main/behaviors";
import { KeypadInput } from "@matter/main/clusters";
import { testBit } from "../../../../../utils/test-bit.js";
import { HomeAssistantEntityBehavior } from "../../../../behaviors/home-assistant-entity-behavior.js";

const logger = Logger.get("MediaPlayerKeypadInputServer");

export class MediaPlayerKeypadInputServer extends Base {
  override sendKey(
    request: KeypadInput.SendKeyRequest,
  ): KeypadInput.SendKeyResponse {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    if (!homeAssistant.isAvailable) {
      return { status: KeypadInput.Status.InvalidKeyInCurrentState };
    }

    const attributes = homeAssistant.entity.state
      .attributes as MediaPlayerDeviceAttributes;
    const features = attributes.supported_features ?? 0;
    const action = this.mapKeyToAction(request.keyCode, features);

    if (!action) {
      logger.debug(
        `Unsupported key code ${request.keyCode} for ${homeAssistant.entityId}`,
      );
      return { status: KeypadInput.Status.UnsupportedKey };
    }

    logger.debug(
      `sendKey(${request.keyCode}) → ${action} for ${homeAssistant.entityId}`,
    );
    homeAssistant.callAction({ action });
    return { status: KeypadInput.Status.Success };
  }

  private mapKeyToAction(
    keyCode: KeypadInput.CecKeyCode,
    features: number,
  ): string | undefined {
    switch (keyCode) {
      // Playback
      case KeypadInput.CecKeyCode.Play:
      case KeypadInput.CecKeyCode.PlayFunction:
        if (testBit(features, MediaPlayerDeviceFeature.PLAY)) {
          return "media_player.media_play";
        }
        return undefined;

      case KeypadInput.CecKeyCode.Pause:
      case KeypadInput.CecKeyCode.PausePlayFunction:
        if (testBit(features, MediaPlayerDeviceFeature.PAUSE)) {
          return "media_player.media_pause";
        }
        return undefined;

      case KeypadInput.CecKeyCode.Stop:
      case KeypadInput.CecKeyCode.StopFunction:
        if (testBit(features, MediaPlayerDeviceFeature.STOP)) {
          return "media_player.media_stop";
        }
        return undefined;

      // Track navigation
      case KeypadInput.CecKeyCode.Forward:
      case KeypadInput.CecKeyCode.FastForward:
        if (testBit(features, MediaPlayerDeviceFeature.NEXT_TRACK)) {
          return "media_player.media_next_track";
        }
        return undefined;

      case KeypadInput.CecKeyCode.Backward:
      case KeypadInput.CecKeyCode.Rewind:
        if (testBit(features, MediaPlayerDeviceFeature.PREVIOUS_TRACK)) {
          return "media_player.media_previous_track";
        }
        return undefined;

      // Volume
      case KeypadInput.CecKeyCode.VolumeUp:
        if (testBit(features, MediaPlayerDeviceFeature.VOLUME_STEP)) {
          return "media_player.volume_up";
        }
        return undefined;

      case KeypadInput.CecKeyCode.VolumeDown:
        if (testBit(features, MediaPlayerDeviceFeature.VOLUME_STEP)) {
          return "media_player.volume_down";
        }
        return undefined;

      case KeypadInput.CecKeyCode.Mute:
      case KeypadInput.CecKeyCode.MuteFunction:
        if (testBit(features, MediaPlayerDeviceFeature.VOLUME_MUTE)) {
          return "media_player.volume_mute";
        }
        return undefined;

      case KeypadInput.CecKeyCode.RestoreVolumeFunction:
        if (testBit(features, MediaPlayerDeviceFeature.VOLUME_MUTE)) {
          return "media_player.volume_mute";
        }
        return undefined;

      // Power
      case KeypadInput.CecKeyCode.Power:
      case KeypadInput.CecKeyCode.PowerToggleFunction:
        if (
          testBit(features, MediaPlayerDeviceFeature.TURN_ON) &&
          testBit(features, MediaPlayerDeviceFeature.TURN_OFF)
        ) {
          return "media_player.toggle";
        }
        return undefined;

      case KeypadInput.CecKeyCode.PowerOnFunction:
        if (testBit(features, MediaPlayerDeviceFeature.TURN_ON)) {
          return "media_player.turn_on";
        }
        return undefined;

      case KeypadInput.CecKeyCode.PowerOffFunction:
        if (testBit(features, MediaPlayerDeviceFeature.TURN_OFF)) {
          return "media_player.turn_off";
        }
        return undefined;

      default:
        return undefined;
    }
  }
}
