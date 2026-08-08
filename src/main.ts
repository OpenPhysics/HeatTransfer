/**
 * main.ts
 *
 * Entry point for the simulation. Initializes SceneryStack, creates the
 * screens, and starts the main event loop.
 *
 * !! CRITICAL IMPORT ORDER !!
 * brand.js MUST be the first import. Each module imports the next, so the import nesting is
 *
 *   main → brand → splash → assert → init
 *
 * and therefore the actual EXECUTION order (deepest import runs first) is the reverse:
 *
 *   init → assert → splash → brand → main
 *
 * SceneryStack requires this exact load order. Never reorder these imports.
 */

// brand.js MUST be first; importing it runs the whole chain (init→assert→splash→brand) before main.
import "./brand.js";

import { onReadyToLaunch, PreferencesModel, Sim } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { HeatTransferScreen } from "./combined/HeatTransferScreen.js";
import { ConductionScreen } from "./conduction/ConductionScreen.js";
import { ConvectionScreen } from "./convection/ConvectionScreen.js";
import HeatTransferColors from "./HeatTransferColors.js";
import { StringManager } from "./i18n/StringManager.js";
import { MaterialsScreen } from "./materials/MaterialsScreen.js";
import { HeatTransferPreferencesModel } from "./preferences/HeatTransferPreferencesModel.js";
import { HeatTransferPreferencesNode } from "./preferences/HeatTransferPreferencesNode.js";
import { TemperatureScreen } from "./temperature/TemperatureScreen.js";

onReadyToLaunch(() => {
  const stringManager = StringManager.getInstance();

  // Simulation-specific preferences; initial values come from heatTransferQueryParameters.
  const simPreferences = new HeatTransferPreferencesModel(Tandem.ROOT.createTandem("preferences"));

  const screens = [
    new TemperatureScreen({
      name: stringManager.getScreenNames().temperatureStringProperty,
      tandem: Tandem.ROOT.createTandem("temperatureScreen"),
      backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
    }),
    new ConductionScreen({
      name: stringManager.getScreenNames().conductionStringProperty,
      tandem: Tandem.ROOT.createTandem("conductionScreen"),
      backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
    }),
    new ConvectionScreen({
      name: stringManager.getScreenNames().convectionStringProperty,
      tandem: Tandem.ROOT.createTandem("convectionScreen"),
      backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
    }),
    new HeatTransferScreen({
      name: stringManager.getScreenNames().combinedStringProperty,
      tandem: Tandem.ROOT.createTandem("combinedScreen"),
      backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
    }),
    new MaterialsScreen({
      name: stringManager.getScreenNames().materialsStringProperty,
      tandem: Tandem.ROOT.createTandem("materialsScreen"),
      backgroundColorProperty: HeatTransferColors.backgroundColorProperty,
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
            createContent: (tandem: Tandem) => new HeatTransferPreferencesNode(simPreferences, tandem),
          },
        ],
      },
      localizationOptions: {
        // Adds a language picker in Preferences → Language
        supportsDynamicLocale: true,
      },
    }),

    // Optional: fill in credits shown in Help → About
    credits: {
      leadDesign: "",
      softwareDevelopment: "",
      team: "",
      qualityAssurance: "",
    },
  });

  sim.start();
});
