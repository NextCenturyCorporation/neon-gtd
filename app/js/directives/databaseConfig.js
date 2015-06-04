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
.directive('databaseConfig', ['datasets', 'layouts', 'ConnectionService', 'DatasetService', function(datasets, layouts, connectionService, datasetService) {
    return {
        templateUrl: 'partials/directives/databaseConfig.html',
        restrict: 'E',
        scope: {
            storeSelect: '=',
            hostName: '=',
            gridsterConfigs: "="
        },
        link: function($scope, el) {
            el.addClass('databaseConfig');

            $scope.showDbTable = false;
            $scope.selectedDB = null;
            $scope.selectedTable = null;
            $scope.databases = [];
            $scope.dbTables = [];
            $scope.tableFields = [];
            $scope.tableFieldMappings = {};
            $scope.isConnected = false;
            $scope.clearPopover = '';
            $scope.activeServer = "Choose dataset";
            $scope.servers = datasets;

            $scope.fields = [
                {
                    label: "Latitude",
                    name: "latitude",
                    selected: ""
                },
                {
                    label: "Longitude",
                    name: "longitude",
                    selected: ""
                },
                {
                    label: "Date (and Time)",
                    name: "date",
                    selected: ""
                }
            ];

            $scope.datastoreSelect = $scope.storeSelect || 'mongo';
            $scope.hostnameInput = $scope.hostName || 'localhost';
            $scope.tableNameToFieldNames = {};

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
            };

            $scope.connectToDataServer = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "dataset-selector",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", $scope.datastoreSelect]
                });

                $scope.showDbTable = true;

                // Clear the active dataset while creating a custom connection so the visualizations cannot query.
                datasetService.setActiveDataset({});

                // Connect to the datastore.
                connectionService.createActiveConnection($scope.datastoreSelect, $scope.hostnameInput);

                // Clear the table names to force re-selection by the user.
                $scope.databases = [];
                $scope.dbTables = [];
                $scope.selectedDB = null;
                $scope.selectedTable = null;

                // Flag that we're connected for the front-end controls enable/disable code.
                $scope.isConnected = true;

                // Pull in the databse names.
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.getDatabaseNames(function(results) {
                        $scope.$apply(function() {
                            populateDatabaseDropdown(results);
                        });
                    });
                }
            };

            $scope.connectToPreset = function(server) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "dataset-menu",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", server.name, "connect"]
                });

                // Change name of active connection.
                $scope.activeServer = server.name;

                // Set datastore connection details and connect to the datastore.
                $scope.datastoreSelect = server.datastore;
                $scope.hostnameInput = server.hostname;
                $scope.connectToDataServer();

                datasetService.setActiveDataset(server);

                $scope.selectedDB = server.databases[0].name;
                $scope.selectedTable = server.databases[0].tables[0].name;
                $scope.tableFields = server.databases[0].tables[0].fields;
                $scope.tableFieldMappings = server.databases[0].tables[0].mappings;

                var databaseNames = [];
                for(var i = 0; i < server.databases.length; ++i) {
                    databaseNames.push(server.databases[i].name);
                }

                // Update the layout (and create new visualizations) after the table/field names are added to the DatasetService so they are available to the new visualizations.
                $scope.updateDatabases(databaseNames, $scope.updateLayout);
            };

            var populateDatabaseDropdown = function(dbs) {
                $scope.databases = dbs;
            };

            $scope.connectToDatabase = function(updateFieldsCallback) {
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.getTableNames($scope.selectedDB, function(tableNames) {
                        $scope.$apply(function() {
                            populateTableDropdown(tableNames);
                        });
                    });
                    $scope.updateFieldsForTables(updateFieldsCallback);
                }
            };

            $scope.selectDatabase = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", $scope.selectedDB, "database"]
                });

                if($scope.selectedDB) {
                    $scope.updateDatabases([$scope.selectedDB]);
                } else {
                    $scope.dbTables = [];
                }
            };

            $scope.updateDatabases = function(databaseNames, updateCallback) {
                var databaseName = databaseNames.shift();

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    // This is a temporary solution.
                    if(!datasetService.getDatabaseWithName(databaseName)) {
                        datasetService.dataset.databases.push({
                            name: databaseName,
                            tables: []
                        });
                    }
                    
                    connection.getTableNamesAndFieldNames(databaseName, function(tableNamesAndFieldNames) {
                        $scope.$apply(function() {
                            var tableNames = Object.keys(tableNamesAndFieldNames);
                            populateTableDropdown(tableNames);

                            for(var i = 0; i < tableNames.length; ++i) {
                                var tableName = tableNames[i];

                                // Update the fields for this table if it exists in the active dataset.
                                datasetService.updateFields(databaseName, tableName, tableNamesAndFieldNames[tableName]);

                                // Store fields for each table locally because the dataset service ignores tables not included in the dataset.
                                // TODO Determine how to handle fields from tables in the database that are not included in the dataset.  This may
                                //      be solved once we update the custom connection interface to support multi-table datasets and field mappings.
                                $scope.tableNameToFieldNames[tableName] = tableNamesAndFieldNames[tableName];

                                if(databaseName === $scope.selectedDB && tableName === $scope.selectedTable) {
                                    $scope.tableFields = datasetService.getDatabaseFields(databaseName, tableName);
                                }
                            }

                            if(databaseNames.length) {
                                $scope.updateDatabases(databaseNames, updateCallback);
                            } else if(updateCallback) {
                                updateCallback();
                            }
                        });
                    });
                }
            };

            $scope.selectTable = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", $scope.selectedTable, "table"]
                });

                $scope.tableFields = datasetService.getDatabaseFields($scope.selectedDB, $scope.selectedTable);
                // If the table does not exist in the dataset configuration, use the locally stored field names for the table.
                if(!($scope.tableFields.length)) {
                    $scope.tableFields = $scope.tableNameToFieldNames[$scope.selectedTable];
                }
                
                // Iterates through the list of fields and looks for ones that match latitude, longitude, and time.
                // Backwards instead of forwards because it allows use of one fewer variables and because the final value
                // winds up with the first match in the list rather than the last.
                var counter = $scope.tableFields.length - 1;
                for(; counter >= 0; counter--) {
                    if($scope.tableFields[counter].search(/latitude|\blat\b/i) != -1) {
                        $scope.fields[0].selected = $scope.tableFields[counter];
                    }
                    else if($scope.tableFields[counter].search(/longitude|\blong\b/i) != -1) {
                        $scope.fields[1].selected = $scope.tableFields[counter];
                    }
                    else if($scope.tableFields[counter].search(/\bdate\b|time|created|\byyyy|yyyy\b|update/i) != -1) {
                        $scope.fields[2].selected = $scope.tableFields[counter];
                    }
                }
                $scope.tableFieldMappings = datasetService.getMappings($scope.selectedDB, $scope.selectedTable);
            };

            $scope.selectField = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "field-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "field", "mapping"]
                });
            };

            $scope.openedCustom = function() {
                XDATA.userALE.log({
                    activity: "open",
                    action: "click",
                    elementId: "custom-connection",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["custom", "dataset", "dialog"]
                });
            };

            var populateTableDropdown = function(tables) {
                $scope.dbTables = tables;
            };

            $scope.updateLayout = function() {
                var layoutName = datasetService.getLayout();

                // Log the layout/dataset change.
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
                $scope.gridsterConfigs = layouts[layoutName] ? layouts[layoutName] : [];

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

            $scope.connectClick = function() {
                $scope.activeServer = "Custom";

                datasetService.setActiveDataset({
                    datastore: $scope.datastoreSelect,
                    hostname: $scope.hostnameInput,
                    databases: [{
                        name: $scope.selectedDB,
                        tables: [{
                            name: $scope.selectedTable
                        }],
                        relations: []
                    }]
                });

                // Update the fields for this table in the new custom dataset.
                datasetService.updateFields($scope.selectedDB, $scope.selectedTable, $scope.tableFields);

                $scope.updateLayout();

                for(var key in $scope.fields) {
                    if(Object.prototype.hasOwnProperty.call($scope.fields, key)) {
                        var field = $scope.fields[key];
                        if(field.selected) {
                            datasetService.setMapping($scope.selectedDB, $scope.selectedTable, field.name, field.selected);
                        }
                    }
                }

                XDATA.userALE.log({
                    activity: "close",
                    action: "click",
                    elementId: "custom-connect-button",
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["custom", "dataset", "connect"]
                });
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();

                for(var i = 0; i < $scope.servers.length; ++i) {
                    if($scope.servers[i].connectOnLoad) {
                        $scope.connectToPreset($scope.servers[i]);
                        $scope.clearPopover = 'sr-only';
                        break;
                    }
                }
            });
        }
    };
}]);
