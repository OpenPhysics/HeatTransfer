/**
 * main.ts
 *
 * Entry point. Initializes SceneryStack, acquires the GPU device, creates the
 * screens, and starts the main event loop.
 *
 * !! CRITICAL IMPORT ORDER !!
 * brand.js MUST be the first import. Each module imports the next, so the import
 * nesting is
 *
 *   main → brand → splash → assert → init
 *
 * and therefore the actual EXECUTION order (deepest import runs first) is the
 * reverse:
 *
 *   init → assert → splash → brand → main
 *
 * SceneryStack requires this exact load order. Never reorder these imports.
 *
 * ── Why there is an await here ────────────────────────────────────────────────
 * The field engines are built when a screen's model is constructed, which
 * SceneryStack does lazily and synchronously. Acquiring a WebGPU adapter, device,
 * and validated shaders is unavoidably asynchronous, so it happens once here —
 * while the splash screen is still up — and the answer is cached. Every screen
 * afterwards asks a synchronous question and gets a synchronous answer. If the
 * device cannot be had, or a shader fails to compile on this driver, the engines
 * silently use the CPU reference backend instead and the status line under the
 * field says so.
 */

// brand.js MUST be first; importing it runs the whole chain (init→assert→splash→brand) before main.
import "./brand.js";

import { onReadyToLaunch, PreferencesModel, Sim } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { HeatTransferScreen } from "./combined/HeatTransferScreen.js";
import { initializeGpuContext } from "./common/field/gpu/GpuContext.js";
import { ConductionScreen } from "./conduction/ConductionScreen.js";
import { ConvectionScreen } from "./convection/ConvectionScreen.js";
import HeatTransferColors from "./HeatTransferColors.js";
import { StringManager } from "./i18n/StringManager.js";
import { MaterialsScreen } from "./materials/MaterialsScreen.js";
import { HeatTransferPreferencesModel } from "./preferences/HeatTransferPreferencesModel.js";
import { HeatTransferPreferencesNode } from "./preferences/HeatTransferPreferencesNode.js";
import heatTransferQueryParameters from "./preferences/heatTransferQueryParameters.js";
import { TemperatureScreen } from "./temperature/TemperatureScreen.js";

onReadyToLaunch(() => {
  const stringManager = StringManager.getInstance();
  const preferences = new HeatTransferPreferencesModel(Tandem.ROOT.createTandem("preferences"));

  const launch = (): void => {
    const screenNames = stringManager.getScreenNames();

    const screens = [
      new TemperatureScreen({
        name: screenNames.temperatureStringProperty,
        tandem: Tandem.ROOT.createTandem("temperatureScreen"),
        backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
        preferences,
      }),
      new ConductionScreen({
        name: screenNames.conductionStringProperty,
        tandem: Tandem.ROOT.createTandem("conductionScreen"),
        backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
        preferences,
      }),
      new ConvectionScreen({
        name: screenNames.convectionStringProperty,
        tandem: Tandem.ROOT.createTandem("convectionScreen"),
        backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
        preferences,
      }),
      new HeatTransferScreen({
        name: screenNames.combinedStringProperty,
        tandem: Tandem.ROOT.createTandem("combinedScreen"),
        backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
        preferences,
      }),
      new MaterialsScreen({
        name: screenNames.materialsStringProperty,
        tandem: Tandem.ROOT.createTandem("materialsScreen"),
        backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
        preferences,
      }),
    ];

    const sim = new Sim(stringManager.getTitleStringProperty(), screens, {
      preferencesModel: new PreferencesModel({
        visualOptions: {
          // Adds a "Projector Mode" toggle in Preferences → Visual
          supportsProjectorMode: true,
          // Enables keyboard-navigation highlight outlines
          supportsInteractiveHighlights: true,
        },
        simulationOptions: {
          customPreferences: [
            {
              createContent: (tandem: Tandem) => new HeatTransferPreferencesNode(preferences, tandem),
            },
          ],
        },
        localizationOptions: {
          // Adds a language picker in Preferences → Language
          supportsDynamicLocale: true,
        },
      }),

      credits: {
        leadDesign: "",
        softwareDevelopment: "",
        team: "",
        qualityAssurance: "",
      },
    });

    sim.start();
  };

  // A rejected device request is already folded into the resolved value, so this
  // never rejects; the `catch` is belt and braces so a launch failure can never be
  // caused by the GPU probe itself.
  initializeGpuContext(heatTransferQueryParameters.forceCpu).then(launch, launch);
});
