'use strict';
/*
 * Copyright 2014 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
angular.module('neonDemo.directives')
.directive('databaseConfig', ['layouts', 'ConnectionService', 'DatasetService',
    function(layouts, connectionService, datasetService) {
    return {
        templateUrl: 'partials/directives/databaseConfig.html',
        restrict: 'E',
        scope: {
            storeSelect: '=',
            hostName: '=',
            gridsterConfigs: "=",
            hideAdvancedOptions: "="
        },
        link: function($scope, $element) {
            $element.addClass('databaseConfig');

            $scope.HIDE_INFO_POPOVER = "sr-only";

            $scope.datasets = datasetService.getDatasets();
            $scope.activeDataset = {
                name: "Choose Dataset",
                info: "",
                data: false
            };

            $scope.datasetName = "";
            $scope.datasetNameIsValid = false;
            $scope.datastoreType = $scope.storeSelect || 'mongo';
            $scope.datastoreHost = $scope.hostName || 'localhost';
            $scope.databases = [];
            $scope.isConnected = false;

            /**
             * This is the array of custom database objects configured by the user through the popup.  Each custom database contains:
             *     {Object} database The database object
             *     {Array} customTables The array of custom table objects configured by the user through the popup.  Each custom table contains:
             *         {Object} table The table object
             *         {Object} latitude The field object for the latitude
             *         {Object} longitude The field object for the longitude
             *         {Object} date The field object for the date
             *         {Object} tags The field object for the hashtags
             */
            $scope.customDatabases = [];

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.datasets.forEach(function(dataset, index) {
                    if(dataset.connectOnLoad) {
                        $scope.connectToPreset(index);
                        return;
                    }
                });
            };

            /**
             * Connects to the preset dataset at the given index.
             * @param {Number} index
             * @method connectToPreset
             */
            $scope.connectToPreset = function(index) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "dataset-menu",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", $scope.datasets[index].name, "connect"]
                });

                $scope.activeDataset = {
                    name: $scope.datasets[index].name,
                    info: $scope.HIDE_INFO_POPOVER,
                    data: true
                };

                $scope.datastoreType = $scope.datasets[index].datastore;
                $scope.datastoreHost = $scope.datasets[index].hostname;
                $scope.databases = [];
                $scope.customDatabases = [];
                $scope.addNewCustomDatabase();

                var connection = connectionService.createActiveConnection($scope.datastoreType, $scope.datastoreHost);
                if(!connection) {
                    return;
                }

                // Update the fields within each database and table within the selected dataset to include fields that weren't listed in the configuration file.
                datasetService.updateDatabases($scope.datasets[index], connection, function(dataset) {
                    $scope.datasets[index] = dataset;
                    datasetService.setActiveDataset(dataset);
                    $scope.$apply(function() {
                        // Wait to update the layout until after the update is finished.
                        updateLayout();
                    });
                });
            };

            /**
             * Updates the layout of visualizations in the dashboard for the active dataset.
             * @method updateLayout
             * @private
             */
            var updateLayout = function() {
                var layoutName = datasetService.getLayout();

                XDATA.userALE.log({
                    activity: "select",
                    action: "show",
                    elementId: "dataset-selector",
                    elementType: "workspace",
                    elementGroup: "top",
                    source: "system",
                    tags: ["connect", "dataset"]
                });

                // Clear any old filters prior to loading the new layout and dataset.
                $scope.messenger.clearFiltersSilently();

                // Use the default layout (if it exists) for custom datasets or datasets without a layout.
                if(!layoutName || !layouts[layoutName]) {
                    layoutName = "default";
                }

                // Recreate the layout each time to ensure all visualizations are using the new dataset.
                $scope.gridsterConfigs = layouts[layoutName] ? angular.copy(layouts[layoutName]) : [];

                // TODO Set default minimum size in config.json
                for(var i = 0; i < $scope.gridsterConfigs.length; ++i) {
                    $scope.gridsterConfigs[i].id = uuid();
                    if(!($scope.gridsterConfigs[i].minSizeX)) {
                        $scope.gridsterConfigs[i].minSizeX = 2;
                    }
                    if(!($scope.gridsterConfigs[i].minSizeY)) {
                        $scope.gridsterConfigs[i].minSizeY = 2;
                    }
                }
            };

            /**
             * Connects to the data server with the global datastore type and host.
             * @method connectToServer
             */
            $scope.connectToServer = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "dataset-selector",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", $scope.datastoreType]
                });

                // Clear the active dataset while creating a custom connection so the visualizations cannot query.
                datasetService.setActiveDataset({});

                $scope.databases = [];
                $scope.customDatabases = [];
                $scope.addNewCustomDatabase();

                var connection = connectionService.createActiveConnection($scope.datastoreType, $scope.datastoreHost);
                if(!connection) {
                    return;
                }

                $scope.isConnected = true;

                connection.getDatabaseNames(function(databaseNames) {
                    $scope.$apply(function() {
                        databaseNames.forEach(function(databaseName) {
                            $scope.databases.push({
                                name: databaseName,
                                tables: []
                            });
                        });
                        updateDatabases(connection);
                    });
                });
            };

            /**
             * Updates the fields in the tables in the global databases starting at the given index (default 0) by querying using the given connection.
             * @param {Object} connection
             * @param {Number} index (optional)
             * @method updateDatabases
             * @private
             */
            var updateDatabases = function(connection, index) {
                var databaseIndex = index ? index : 0;
                var database = $scope.databases[databaseIndex];
                connection.getTableNamesAndFieldNames(database.name, function(tableNamesAndFieldNames) {
                    $scope.$apply(function() {
                        Object.keys(tableNamesAndFieldNames).forEach(function(tableName) {
                            var table = {
                                name: tableName,
                                fields: [],
                                mappings: {}
                            };

                            tableNamesAndFieldNames[tableName].forEach(function(fieldName) {
                                table.fields.push({
                                    columnName: fieldName,
                                    prettyName: fieldName
                                });
                            });

                            database.tables.push(table);
                        });

                        if(++databaseIndex < $scope.databases.length) {
                            updateDatabases(connection, databaseIndex);
                        }
                    });
                });
            };

            /**
             * Resets the latitude, longitude, date and hashtag field mappings in the given custom table object and returns the object.
             * @param {Object} customTable
             * @method resetFieldMappings
             * @private
             */
            var resetFieldMappings = function(customTable) {
                customTable.date = {
                    columnName: "",
                    prettyName: ""
                };
                customTable.latitude = {
                    columnName: "",
                    prettyName: ""
                };
                customTable.longitude = {
                    columnName: "",
                    prettyName: ""
                };
                customTable.tags = {
                    columnName: "",
                    prettyName: ""
                };
                return customTable;
            };

            /**
             * Creates and returns a new custom table object.
             * @method createCustomTable
             * @private
             */
            var createCustomTable = function() {
                var customTable = {
                    table: {
                        name: ""
                    }
                };
                return resetFieldMappings(customTable);
            };

            /**
             * Selection event for the given custom database object.
             * @param {Object} customDatabase
             * @method selectDatabase
             */
            $scope.selectDatabase = function(customDatabase) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", customDatabase.database.name, "database"]
                });

                customDatabase.customTables = [createCustomTable()];
            };

            /**
             * Selection event for the given custom table object.
             * @param {Object} customTable
             * @method selectTable
             */
            $scope.selectTable = function(customTable) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", customTable.table.name, "table"]
                });

                guessDefaultFieldMappings(customTable);
            };

            /**
             * Sets the default latitude, longitude, date, and hashtag field mappings for the given custom table object if possible by guessing.
             * @param {Object} customTable
             * @method guessDefaultFieldMappings
             * @private
             */
            var guessDefaultFieldMappings = function(customTable) {
                customTable = resetFieldMappings(customTable);

                // Iterates through the list of fields and looks for ones that match latitude, longitude, and time.
                // Backwards instead of forwards because it allows use of one fewer variables and because the final value
                // winds up with the first match in the list rather than the last.
                for(var counter = customTable.table.fields.length - 1; counter >= 0; counter--) {
                    if(customTable.table.fields[counter].columnName.search(/\bdate\b|time|created|\byyyy|yyyy\b|update/i) !== -1) {
                        customTable.date = customTable.table.fields[counter];
                    } else if(customTable.table.fields[counter].columnName.search(/latitude|\blat\b/i) !== -1) {
                        customTable.latitude = customTable.table.fields[counter];
                    } else if(customTable.table.fields[counter].columnName.search(/longitude|\blong\b|\blon\b/i) !== -1) {
                        customTable.longitude = customTable.table.fields[counter];
                    } else if(customTable.table.fields[counter].columnName.search(/hash|tag/i) !== -1) {
                        customTable.tags = customTable.table.fields[counter];
                    }
                }
            };

            /**
             * Selection event for the given mapping set to the given field.
             * @param {String} mapping
             * @param {Object} field
             * @method selectMapping
             */
            $scope.selectMapping = function(mapping, field) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "field-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", mapping, "mapping", field.columnName, "field"]
                });
            };

            /**
             * Selection event for the custom dataset popup.
             * @method selectCustom
             */
            $scope.selectCustom = function() {
                XDATA.userALE.log({
                    activity: "open",
                    action: "click",
                    elementId: "custom-dataset",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["custom", "dataset", "dialog"]
                });
            };

            /**
             * Sets the active dataset to the databases and tables in the list of custom databases and saves it in the Dataset Service.
             * @method setDataset
             */
            $scope.setDataset = function() {
                XDATA.userALE.log({
                    activity: "close",
                    action: "click",
                    elementId: "custom-dataset-done",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["custom", "dataset", "connect"]
                });

                $scope.activeDataset = {
                    name: $scope.datasetName,
                    info: $scope.HIDE_INFO_POPOVER,
                    data: true
                };

                var dataset = {
                    name: $scope.datasetName,
                    datastore: $scope.datastoreType,
                    hostname: $scope.datastoreHost,
                    databases: []
                };

                $scope.customDatabases.forEach(function(customDatabase) {
                    var database = {
                        name: customDatabase.database.name,
                        tables: [],
                        relations: []
                    };

                    customDatabase.customTables.forEach(function(customTable) {
                        var tableObject = {
                            name: customTable.table.name,
                            fields: customTable.table.fields,
                            mappings: {
                                latitude: customTable.latitude.columnName,
                                longitude: customTable.longitude.columnName,
                                date: customTable.date.columnName,
                                tags: customTable.tags.columnName
                            }
                        };

                        database.tables.push(tableObject);
                    });

                    dataset.databases.push(database);
                });

                $scope.datasets = datasetService.addDataset(dataset);
                datasetService.setActiveDataset(dataset);
                updateLayout();

                $scope.datasetName = "";
                $scope.datasetNameIsValid = false;

                $element.find(".modal").modal("hide");
            };

            /**
             * Adds a new custom table element to the list of custom tables for the given database.
             * @param {Object} customDatabase
             * @method addNewCustomTable
             */
            $scope.addNewCustomTable = function(customDatabase) {
                customDatabase.customTables.push(createCustomTable());
            };

            /**
             * Adds a new custom database element to the global list of custom databases.
             * @method addNewCustomDatabase
             */
            $scope.addNewCustomDatabase = function() {
                var customDatabase = {
                    customTables: [],
                    database: {
                        name: ""
                    }
                };
                $scope.addNewCustomTable(customDatabase);
                $scope.customDatabases.push(customDatabase);
            };

            /**
             * Removes the custom table element at the given index from the list of custom tables for the given custom database element.
             * @param {Object} customDatabase
             * @param {Number} index
             * @method removeCustomTable
             */
            $scope.removeCustomTable = function(customDatabase, index) {
                customDatabase.customTables.splice(index, 1);
            };

            /**
             * Removes the custom database element at the given index from the global list of custom databases.
             * @param {Number} index
             * @method removeCustomDatabase
             */
            $scope.removeCustomDatabase = function(index) {
                $scope.customDatabases.splice(index, 1);
            };

            /**
             * Validates the global dataset name by checking if its already in use by another dataset.
             * @method validateDatasetName
             */
            $scope.validateDatasetName = function() {
                $scope.datasetNameIsValid = ($scope.datasetName !== "");
                $scope.datasets.forEach(function(dataset) {
                    if(dataset.name === $scope.datasetName) {
                        $scope.datasetNameIsValid = false;
                    }
                });
            };

            /**
             * Triggered by connecting to a datastore.
             * @method changeHost
             */
            $scope.changeHost = function() {
                $scope.isConnected = false;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
            });
        }
    };
}]);
