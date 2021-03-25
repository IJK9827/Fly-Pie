//////////////////////////////////////////////////////////////////////////////////////////
//        ___            _     ___                                                      //
//        |   |   \/    | ) |  |           This software may be modified and distri-    //
//    O-  |-  |   |  -  |   |  |-  -O      buted under the terms of the MIT license.    //
//        |   |_  |     |   |  |_          See the LICENSE file for details.            //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const {Gtk, GLib} = imports.gi;

const _ = imports.gettext.domain('flypie').gettext;

const Me                  = imports.misc.extensionUtils.getCurrentExtension();
const utils               = Me.imports.src.common.utils;
const ItemRegistry        = Me.imports.src.common.ItemRegistry;
const ConfigWidgetFactory = Me.imports.src.common.ConfigWidgetFactory.ConfigWidgetFactory;

// We have to import the Clutter, Main, Shell, and St modules optionally. This is because
// this file is included from both sides: From prefs.js and from extension.js. When
// included from prefs.js, the modules are not available. This is not a problem, as the
// preferences will not call the createItem() methods below; they are merely interested in
// the menu's name, icon and description.
let Clutter = undefined;
let Main    = undefined;
let Shell   = undefined;
let St      = undefined;

try {
  Clutter = imports.gi.Clutter;
  Main    = imports.ui.main;
  Shell   = imports.gi.Shell;
  St      = imports.gi.Shell;
} catch (error) {
  // Nothing to be done, we're in settings-mode.
}

//////////////////////////////////////////////////////////////////////////////////////////
// Returns an item with entries for all running applications. Clicking these will bring //
// the corresponding app to the foreground. Like Alt-Tab.                               //
// See common/ItemRegistry.js for a description of the action's format.                 //
//////////////////////////////////////////////////////////////////////////////////////////

var menu = {

  // There are two fundamental item types in Fly-Pie: Actions and Menus. Actions have an
  // onSelect() method which is called when the user selects the item, Menus can have
  // child Actions or Menus.
  class: ItemRegistry.ItemClass.MENU,

  // This will be shown in the add-new-item-popover of the settings dialog.
  name: _('Running Apps'),

  // This is also used in the add-new-item-popover.
  icon: 'preferences-system-windows',

  // Translators: Please keep this short.
  // This is the (short) description shown in the add-new-item-popover.
  subtitle: _('Shows the currently running applications.'),

  // This is the (long) description shown when an item of this type is selected.
  description: _(
      'The <b>Running Apps</b> menu shows all currently running applications. This is similar to the Alt+Tab window selection. As the entries change position frequently, this is actually not very effective.'),

  // Items of this type have several additional configuration parameter.
  config: {
    // This is used as data for newly created items of this type.
    defaultData: {
      activeqWorkspaceOnly: false,
      appGrouping: true,
      hoverPeeking: true,
      nameRegex: ''
    },

    // This is called whenever an item of this type is selected in the menu editor. It
    // returns a Gtk.Widget which will be shown in the sidebar of the menu editor. The
    // currently configured data object will be passed as first parameter. The second
    // parameter is a callback which is fired whenever the user changes something in the
    // widgets.
    getWidget(data, updateCallback) {
      // Use default data for undefined properties.
      data = {...this.defaultData, ...data};

      const vBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 5});

      let toggles   = [];
      let nameRegex = data.nameRegex;

      const updateData = () => {
        updateCallback({
          activeqWorkspaceOnly: toggles[0].active,
          appGrouping: toggles[1].active,
          hoverPeeking: toggles[2].active,
          nameRegex: nameRegex
        });
      };

      const tooltip = _(
          'You can use this to filter the displayed windows. Regular expressions are supported: Use a simple string like "Fire" to show only windows whose titles contain "Fire" (e.g. Firefox). Use "Fire|Water" to match either "Fire" or "Water". A negation would be "^(?!.*Fire)" to match anything but "Fire". Remember to use the live preview to instantly see the results!');

      const regexEntry = ConfigWidgetFactory.createTextWidget(
          _('Window Filter'), _('See Tooltip for details.'), tooltip, data.nameRegex,
          (text) => {
            nameRegex = text;
            updateData();
          });
      vBox.pack_start(regexEntry, false, false, 0);

      const createToggle = (i, name, value) => {
        const hBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 5});
        hBox.pack_start(
            new Gtk.Label({label: name, halign: Gtk.Align.START}), true, true, 0);

        const toggle = new Gtk.Switch({active: value, halign: Gtk.Align.END});
        hBox.pack_start(toggle, false, false, 0);

        toggle.connect('notify::active', () => {
          updateData();
        });

        vBox.pack_start(hBox, false, false, 0);

        return toggle;
      };

      toggles[0] = createToggle(0, _('Active Workspace Only'), data.activeqWorkspaceOnly);
      toggles[1] = createToggle(1, _('Group by Application'), data.appGrouping);
      toggles[2] = createToggle(2, _('Peek on Hover'), data.hoverPeeking);

      return vBox;
    }
  },

  // This will be called whenever a menu is opened containing an item of this kind.
  createItem: (data) => {
    // Use default data for undefined properties.
    data = {...menu.config.defaultData, ...data};

    const apps = Shell.AppSystem.get_default().get_running();
    apps.sort((a, b) => a.get_name().localeCompare(b.get_name()));

    const result = {children: []};

    for (let i = 0; i < apps.length; ++i) {
      let icon = 'image-missing';
      try {
        icon = apps[i].get_app_info().get_icon().to_string();
      } catch (e) {
      }

      const windows = apps[i].get_windows();
      windows.sort((a, b) => a.get_title().localeCompare(b.get_title()));

      let parentMenu = result;

      if (data.appGrouping && windows.length > 1) {
        parentMenu = {name: apps[i].get_name(), icon: icon, children: []};
        result.children.push(parentMenu);
      }

      windows.forEach(window => {
        // Filter windows which are not on the current workspace.
        if (!data.activeqWorkspaceOnly ||
            window.get_workspace() == global.workspace_manager.get_active_workspace()) {

          // Filter windows which do not match the regex.
          const regex = new RegExp(data.nameRegex);
          if (regex.test(window.title)) {
            parentMenu.children.push({
              name: window.get_title(),
              icon: icon,
              onSelect: () => {
                if (!data.hoverPeeking) {
                  window.get_workspace().activate_with_focus(
                      window, global.display.get_current_time_roundtrip());
                }
              },
              onHover: () => {
                if (data.hoverPeeking) {
                  window.get_workspace().activate_with_focus(
                      window, global.display.get_current_time_roundtrip());
                }
              }
            });
          }
        }
      });
    }

    return result;
  }
};