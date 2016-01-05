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
.directive('databaseConfig', ['$location', 'config', 'layouts', 'visualizations', 'ConnectionService', 'DatasetService', 'ParameterService', 'ErrorNotificationService',
    function($location, config, layouts, visualizations, connectionService, datasetService, parameterService, errorNotificationService) {
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
            $scope.DATASTORE = 1;
            $scope.DATABASE = 2;
            $scope.FIELDS = 3;
            $scope.RELATIONS = 4;
            $scope.LAYOUT = 5;

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
            $scope.isLoading = false;
            $scope.error = false;
            $scope.step = 1;
            $scope.fieldTypes = {};
            $scope.visualizations = visualizations;

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

            /**
             * This is the array of custom relation objects configured by the user through the popup.  Each custom relation contains:
             *     {Array} customRelationDatabases The array of custom relation database objects configured by the user through the popup.  Each custom relation database contains:
             *         {Object} database The database object
             *         {Array} customRelationTables The array of custom relation table objects configured by the user through the popup.  Each custom relation table contains:
             *             {Object} table The table object
             *             {Object} field The field object
             */
            $scope.customRelations = [];

            /**
             * This is the array of custom visualization objects configured by the user through the popup.  Each custom visualization contains:
             *     {String} type The visualization type
             *     {Number} sizeX The width of the visualization
             *     {Number} minSizeX The minimum width of the visualization
             *     {Number} sizeY The height of the visualization
             *     {Number} minSizeY The minimum height of the visualization
             *     {String} database The database name to connect to it
             *     {String} table The table name to connect to it
             *     {Array} availableTables An array of table names that are available in the database selected
             */
            $scope.customVisualizations = [];

            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();

                var activeDataset = (parameterService.findActiveDatasetInUrl() || "").toLowerCase();
                $scope.datasets.some(function(dataset, index) {
                    if((activeDataset && activeDataset === dataset.name.toLowerCase()) || (!activeDataset && dataset.connectOnLoad)) {
                        $scope.connectToPreset(index, true);
                        return true;
                    }
                    return false;
                });

                $scope.messenger.subscribe("STATE_CHANGED", function() {
                    $scope.activeDataset = {
                        name: datasetService.getDataset().name,
                        info: $scope.HIDE_INFO_POPOVER,
                        data: true
                    };
                });
            };

            /**
             * Resets the global lists containing the user configuration for the custom dataset.
             * @method resetCustomDataset
             */
            $scope.resetCustomDataset = function() {
                $scope.isConnected = false;
                $scope.databases = [];
                $scope.customDatabases = [];
                $scope.customRelations = [];
                $scope.customVisualizations = [];
                $scope.addNewCustomDatabase();
            };

            /**
             * Connects to the preset dataset at the given index.
             * @param {Number} index
             * @param {Boolean} loadDashboardState Whether to load any saved dashboard states shown upon a dataset change
             * @method connectToPreset
             */
            $scope.connectToPreset = function(index, loadDashboardState) {
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
                $scope.resetCustomDataset();

                var connection = connectionService.createActiveConnection($scope.datastoreType, $scope.datastoreHost);
                if(!connection) {
                    return;
                }

                var finishConnectToPreset = function(dataset, loadDashboardState) {
                    datasetService.setActiveDataset(dataset);
                    updateLayout(loadDashboardState);
                };

                // Don't update the dataset if its fields are already updated.
                if($scope.datasets[index].hasUpdatedFields) {
                    finishConnectToPreset($scope.datasets[index], loadDashboardState);
                    return;
                }

                // Update the fields within each database and table within the selected dataset to include fields that weren't listed in the configuration file.
                datasetService.updateDatabases($scope.datasets[index], connection, function(dataset) {
                    $scope.datasets[index] = dataset;
                    // Update the layout inside a $scope.$apply because we're inside a jQuery ajax callback thread.
                    $scope.$apply(function() {
                        // Wait to update the layout until after we finish the dataset updates.
                        finishConnectToPreset(dataset, loadDashboardState);
                    });
                });
            };

            /**
             * Updates the layout of visualizations in the dashboard for the active dataset.
             * @param {Boolean} loadDashboardState Whether to load any saved dashboard states shown upon a dataset change
             * @method updateLayout
             * @private
             */
            var updateLayout = function(loadDashboardState) {
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

                for(var i = 0; i < $scope.gridsterConfigs.length; ++i) {
                    $scope.gridsterConfigs[i].id = uuid();
                    if(!($scope.gridsterConfigs[i].minSizeX)) {
                        $scope.gridsterConfigs[i].minSizeX = config.gridsterDefaultMinSizeX;
                    }
                    if(!($scope.gridsterConfigs[i].minSizeY)) {
                        $scope.gridsterConfigs[i].minSizeY = config.gridsterDefaultMinSizeY;
                    }
                    if($scope.gridsterConfigs[i].sizeX < config.gridsterDefaultMinSizeX) {
                        $scope.gridsterConfigs[i].sizeX = config.gridsterDefaultMinSizeX;
                    }
                    if($scope.gridsterConfigs[i].sizeY < config.gridsterDefaultMinSizeY) {
                        $scope.gridsterConfigs[i].sizeY = config.gridsterDefaultMinSizeY;
                    }
                }

                parameterService.addFiltersFromUrl(!loadDashboardState);
            };

            /**
             * Updates the layout of visualizations in the dashboard for the custom visualizations set.
             * @method updateCustomLayout
             * @private
             */
            var updateCustomLayout = function() {
                XDATA.userALE.log({
                    activity: "select",
                    action: "show",
                    elementId: "dataset-selector",
                    elementType: "workspace",
                    elementGroup: "top",
                    source: "system",
                    tags: ["connect", "dataset"]
                });

                $scope.gridsterConfigs = [];

                // Clear any old filters prior to loading the new layout and dataset.
                $scope.messenger.clearFilters();

                _.each($scope.customVisualizations, function(visualization) {
                    var layout = {
                        sizeX: visualization.sizeX,
                        sizeY: visualization.sizeY,
                        minSizeX: visualization.minSizeX,
                        minSizeY: visualization.minSizeY,
                        type: visualization.type,
                        id: uuid()
                    };

                    if($scope.showVisualizationDatabaseProperties(visualization)) {
                        layout.bindings = {
                            "bind-database": "'" + visualization.database + "'",
                            "bind-table": "'" + visualization.table + "'"
                        };
                    }

                    $scope.gridsterConfigs.push(layout);
                });

                // Clear any saved states loaded through the parameters
                $location.search("dashboard_state_id", null);
                $location.search("filter_state_id", null);

                parameterService.addFiltersFromUrl();
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

                $scope.resetCustomDataset();

                var connection = connectionService.createActiveConnection($scope.datastoreType, $scope.datastoreHost);
                if(!connection) {
                    return;
                }

                $scope.isLoading = true;

                connection.getDatabaseNames(function(databaseNames) {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.isConnected = true;
                        $scope.error = false;
                        databaseNames.forEach(function(databaseName) {
                            $scope.databases.push({
                                name: databaseName,
                                prettyName: databaseName,
                                tables: []
                            });
                        });
                        updateDatabases(connection);
                    });
                }, function(response) {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.isConnected = false;
                        $scope.error = true;
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
                                prettyName: tableName,
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
             * Creates and returns a new custom table object.
             * @method createCustomTable
             * @private
             */
            var createCustomTable = function() {
                var customTable = {
                    table: {
                        name: "",
                        prettyName: ""
                    }
                };
                return customTable;
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
                    tags: ["dataset", (customTable.table ? customTable.table.name : ""), "table"]
                });

                //guessDefaultFieldMappings(customTable);
            };

            /**
             * Selection event for the given mapping set to the given field.
             * @param {String} mapping
             * @param {Object} field
             * @method selectMapping
             */
            $scope.selectMapping = function(mapping, field, table) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "field-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", mapping, "mapping", field.columnName, "field"]
                });

                table[mapping] = field;
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
             * Creates and returns a new custom dataset object using the user configuration saved in the global variables.
             * @method createCustomDataset
             * @return {Object}
             */
            var createCustomDataset = function() {
                var dataset = {
                    name: $scope.datasetName,
                    datastore: $scope.datastoreType,
                    hostname: $scope.datastoreHost,
                    databases: [],
                    relations: [],
                    options: {
                        requery: 0
                    }
                };

                $scope.customDatabases.forEach(function(customDatabase) {
                    var database = {
                        name: customDatabase.database.name,
                        prettyName: customDatabase.database.prettyName,
                        tables: []
                    };

                    customDatabase.customTables.forEach(function(customTable) {
                        var mappings = {};
                        mappings[neonMappings.DATE] = customTable.date ? customTable.date.columnName : "";
                        mappings[neonMappings.TAGS] = customTable.tags ? customTable.tags.columnName : "";
                        mappings[neonMappings.LATITUDE] = customTable.latitude ? customTable.latitude.columnName : "";
                        mappings[neonMappings.LONGITUDE] = customTable.longitude ? customTable.longitude.columnName : "";
                        mappings[neonMappings.BAR_GROUPS] = customTable.bar_x_axis ? customTable.bar_x_axis.columnName : "";
                        mappings[neonMappings.Y_AXIS] = customTable.y_axis ? customTable.y_axis.columnName : "";
                        mappings[neonMappings.LINE_GROUPS] = customTable.line_category ? customTable.line_category.columnName : "";
                        mappings[neonMappings.AGGREGATE] = customTable.count_by ? customTable.count_by.columnName : "";

                        var tableObject = {
                            name: customTable.table.name,
                            prettyName: customTable.table.prettyName,
                            fields: customTable.table.fields,
                            mappings: mappings
                        };

                        database.tables.push(tableObject);
                    });

                    dataset.databases.push(database);
                });

                $scope.customRelations.forEach(function(customRelation) {
                    var relation = {};

                    customRelation.customRelationDatabases.forEach(function(customRelationDatabase) {
                        if(!relation[customRelationDatabase.database.name]) {
                            relation[customRelationDatabase.database.name] = {};
                        }

                        customRelationDatabase.customRelationTables.forEach(function(customRelationTable) {
                            relation[customRelationDatabase.database.name][customRelationTable.table.name] = customRelationTable.field.columnName;
                        });
                    });

                    dataset.relations.push(relation);
                });

                return dataset;
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

                var dataset = createCustomDataset();

                $scope.activeDataset = {
                    name: dataset.name,
                    info: $scope.HIDE_INFO_POPOVER,
                    data: true
                };

                $scope.datasets = datasetService.addDataset(dataset);
                datasetService.setActiveDataset(dataset);
                updateCustomLayout();

                $scope.datasetName = "";
                $scope.datasetNameIsValid = false;
                $scope.step = $scope.DATASTORE;

                $scope.resetCustomDataset();

                $element.find(".modal").modal("hide");
            };

            /**
             * Adds a new custom table element to the list of custom tables for the given custom database and returns the custom database.
             * @param {Object} customDatabase
             * @method addNewCustomTable
             * @return {Object}
             */
            $scope.addNewCustomTable = function(customDatabase) {
                customDatabase.customTables.push(createCustomTable());
                return customDatabase;
            };

            /**
             * Adds a new custom database element to the global list of custom databases.
             * @method addNewCustomDatabase
             */
            $scope.addNewCustomDatabase = function() {
                var customDatabase = {
                    database: {
                        name: "",
                        prettyName: ""
                    },
                    customTables: []
                };
                $scope.customDatabases.push($scope.addNewCustomTable(customDatabase));
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
             * Selection event for the given custom relation database object.
             * @param {Object} customRelationDatabase
             * @method selectRelationDatabase
             */
            $scope.selectRelationDatabase = function(customRelationDatabase) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "relation-database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "relation", customRelationDatabase.database.name, "database"]
                });

                customRelationDatabase.customRelationTables = [createCustomRelationTable()];
            };

            /**
             * Selection event for the given custom relation table object.
             * @param {Object} customRelationTable
             * @method selectRelationTable
             */
            $scope.selectRelationTable = function(customRelationTable) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "relation-table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "relation", customRelationTable.table.name, "table"]
                });
            };

            /**
             * Selection event for the given custom relation field object.
             * @param {Object} customRelationField
             * @method selectRelationField
             */
            $scope.selectRelationField = function(customRelationField) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "relation-field-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["dataset", "relation", customRelationField.columnName, "field"]
                });
            };

            /**
             * Creates and returns a new custom relation table object.
             * @method createCustomRelationTable
             * @private
             */
            var createCustomRelationTable = function() {
                return {
                    table: {
                        name: "",
                        prettyName: ""
                    },
                    field: {
                        columnName: "",
                        prettyName: ""
                    }
                };
            };

            /**
             * Adds a new custom relation table element to the list of custom relation tables for the given custom relation database and returns the custom relation database.
             * @param {Object} customRelationDatabase
             * @method addNewCustomRelationTable
             * @return {Object}
             */
            $scope.addNewCustomRelationTable = function(customRelationDatabase) {
                customRelationDatabase.customRelationTables.push(createCustomRelationTable());
                return customRelationDatabase;
            };

            /**
             * Adds a new custom relation database element to the list of custom relation databases for the given custom relation and returns the custom relation.
             * @param {Object} customRelation
             * @method addNewCustomRelationDatabase
             * @return {Object}
             */
            $scope.addNewCustomRelationDatabase = function(customRelation) {
                var customRelationDatabase = {
                    database: {
                        name: "",
                        prettyName: ""
                    },
                    customRelationTables: []
                };
                customRelation.customRelationDatabases.push($scope.addNewCustomRelationTable(customRelationDatabase));
                return customRelation;
            };

            /**
             * Adds a new custom relation element to the global list of custom relations.
             * @method addNewCustomRelation
             */
            $scope.addNewCustomRelation = function() {
                var customRelation = {
                    customRelationDatabases: []
                };
                $scope.customRelations.push($scope.addNewCustomRelationDatabase(customRelation));
            };

            /**
             * Removes the custom relation table element at the given index from the list of custom relation tables for the given custom relation database element.
             * @param {Object} customRelationDatabase
             * @param {Number} index
             * @method removeCustomRelationTable
             */
            $scope.removeCustomRelationTable = function(customRelationDatabase, index) {
                customRelationDatabase.customRelationTables.splice(index, 1);
            };

            /**
             * Removes the custom relation database element at the given index from the list of custom relation databases for the given custom relation element.
             * @param {Object} customRelation
             * @param {Number} index
             * @method removeCustomRelationDatabase
             */
            $scope.removeCustomRelationDatabase = function(customRelation, index) {
                customRelation.customRelationDatabases.splice(index, 1);
            };

            /**
             * Removes the custom relation element at the given index from the global list of custom relations.
             * @param {Number} index
             * @method removeCustomRelation
             */
            $scope.removeCustomRelation = function(index) {
                $scope.customRelations.splice(index, 1);
            };

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @method selectVisualization
             */
            $scope.selectVisualization = function(customVisualization) {
                var viz = _.find(visualizations, function(visualization) {
                    return visualization.type === customVisualization.type;
                });

                if(viz) {
                    customVisualization.minSizeX = viz.minSizeX;
                    customVisualization.minSizeY = viz.minSizeY;
                    customVisualization.sizeX = viz.sizeX;
                    customVisualization.sizeY = viz.sizeY;

                    if(!customVisualization.database) {
                        customVisualization.database = $scope.customDatabases[0].database.name;

                        $scope.selectCustomVisualizationDatabase(customVisualization);
                        customVisualization.table = customVisualization.availableTables[0];
                    }
                }
            };

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @method selectCustomVisualizationDatabase
             */
            $scope.selectCustomVisualizationDatabase = function(customVisualization) {
                _.find($scope.customDatabases, function(db) {
                    if(db.database.name === customVisualization.database) {
                        var tables = _.pluck(db.customTables, 'table');
                        customVisualization.availableTables = _.map(tables, function(table) {
                            return table.name;
                        });
                        customVisualization.table = "";
                    }
                });
            };

            /**
             * Get the label for the given custom visualization object
             * @param {Object} customVisualization
             * @method getWidthLabel
             */
            $scope.getWidthLabel = function(customVisualization) {
                if(customVisualization.minSizeX) {
                    return "Width (min: " + customVisualization.minSizeX + ")";
                }
                return "Width";
            };

            /**
             * Get the label for the given custom visualization object
             * @param {Object} customVisualization
             * @method getHeightLabel
             */
            $scope.getHeightLabel = function(customVisualization) {
                if(customVisualization.minSizeY) {
                    return "Height (min: " + customVisualization.minSizeY + ")";
                }
                return "Height";
            };

            /**
             * Returns whether the database and table inputs should be shown for the given custom visualization object.
             * @param {Object} customVisualization
             * @method showVisualizationDatabaseProperties
             */
            $scope.showVisualizationDatabaseProperties = function(customVisualization) {
                if(!customVisualization.type || customVisualization.type === 'filter-builder' || customVisualization.type === 'map' ||
                    customVisualization.type === 'directed-graph' || customVisualization.type === 'gantt-chart') {
                    return false;
                }
                return true;
            };

            /**
             * Adds a new custom visualization element to the global list of custom visualizations.
             * @method addNewCustomVisualization
             */
            $scope.addNewCustomVisualization = function() {
                $scope.customVisualizations.push({
                    availableTables: []
                });
            };

            /**
             * Removes the custom visualization element at the given index from the global list of custom visualizations.
             * @param {Number} index
             * @method removeCustomVisualization
             */
            $scope.removeCustomVisualization = function(index) {
                $scope.customVisualizations.splice(index, 1);
            };

            /**
             * Triggered by selecting a datastore type.
             * @method changeType
             */
            $scope.changeType = function() {
                $scope.isConnected = false;
            };

            /**
             * Triggered by entering a host name.
             * @method changeHost
             */
            $scope.changeHost = function() {
                $scope.isConnected = false;
            };

            /**
             * Returns whether the current step is invalid.
             * @method isStepInvalid
             */
            $scope.isStepInvalid = function() {
                if($scope.step === $scope.DATASTORE) {
                    return !($scope.isConnected && $scope.datasetNameIsValid);
                } else if($scope.step === $scope.DATABASE) {
                    return !($scope.customDatabases.length > 0 &&
                        _.every($scope.customDatabases, function(database) {
                            return database.database && database.database.name && _.every(database.customTables, function(table) {
                                return table.table && table.table.name;
                            });
                        })
                    );
                } else if($scope.step === $scope.FIELDS) {
                    return false;
                } else if($scope.step === $scope.RELATIONS) {
                    return !($scope.customRelations.length === 0 ||
                        _.every($scope.customRelations, function(relation) {
                            return _.every(relation.customRelationDatabases, function(database) {
                                return database.database && database.database.name && _.every(database.customRelationTables, function(table) {
                                    return table.table && table.table.name && table.field && table.field.columnName;
                                });
                            });
                        })
                    );
                } else if($scope.step === $scope.LAYOUT) {
                    return !(_.every($scope.customVisualizations, function(viz) {
                                return viz.minSizeX <= viz.sizeX && viz.minSizeY <= viz.sizeY &&
                                viz.database && viz.table;
                            })
                        );
                }
                return true;
            };

            /**
             * Advances to the next step of the pop-up.
             * @method nextStep
             */
            $scope.nextStep = function() {
                $scope.step++;

                if($scope.step === $scope.FIELDS) {
                    loadFieldTypes();
                } else if($scope.step > $scope.LAYOUT) {
                    $scope.setDataset();
                }
            };

            /**
             * Retrives all field types for all database/table pairs specified in the custom database object.
             * @method loadFieldTypes
             * @private
             */
            var loadFieldTypes = function() {
                var connection = connectionService.createActiveConnection($scope.datastoreType, $scope.datastoreHost);
                if(!connection) {
                    return;
                }

                $scope.isLoading = true;

                var databaseToTableNames = {};

                // Create a mapping of all the custom database names to an array of their custom table names
                _.each($scope.customDatabases, function(database) {
                    if(!databaseToTableNames[database.database.name]) {
                        databaseToTableNames[database.database.name] = [];
                    }

                    _.each(database.customTables, function(table) {
                        if(databaseToTableNames[database.database.name].indexOf(table.table.name) < 0) {
                            databaseToTableNames[database.database.name].push(table.table.name);
                        }
                    });
                });

                connection.getFieldTypesForGroup(databaseToTableNames, function(response) {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.fieldTypes = response;
                    });
                }, function(response) {
                    $scope.isLoading = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage(null, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Gets the field type for the given field name in the given database and table. If not found, returns 'Unknown'.
             * @param {String} databaseName
             * @param {String} tableName
             * @param {String} fieldName
             * @method getFieldType
             */
            $scope.getFieldType = function(databaseName, tableName, fieldName) {
                if($scope.fieldTypes && $scope.fieldTypes[databaseName] && $scope.fieldTypes[databaseName][tableName] &&
                    $scope.fieldTypes[databaseName][tableName][fieldName]) {
                    return $scope.fieldTypes[databaseName][tableName][fieldName];
                }
                return "Unknown";
            };

            /**
             * Goes back one step, if allowed.
             * @method previousStep
             */
            $scope.previousStep = function() {
                if($scope.step - 1 > 0) {
                    $scope.step--;
                }
            };

            /**
             * Toggles the field mappings display for the given custom table.
             * @param {Object} customTable
             * @method toggleFieldMappingsDisplay
             */
            $scope.toggleFieldMappingsDisplay = function(customTable) {
                customTable.showFieldMappings = !customTable.showFieldMappings;
            };

            /**
             * Returns the title of the current step.
             * @method getTitle
             */
            $scope.getTitle = function() {
                var stepTitle;

                if($scope.step === $scope.DATASTORE) {
                    stepTitle = "Connect to Datastore";
                } else if($scope.step === $scope.DATABASE) {
                    stepTitle = "Add Databases";
                } else if($scope.step === $scope.FIELDS) {
                    stepTitle = "Set Mappings";
                } else if($scope.step === $scope.RELATIONS) {
                    stepTitle = "Add Relations";
                } else if($scope.step === $scope.LAYOUT) {
                    stepTitle = "Set Layout";
                }

                return "Custom Dataset - " + stepTitle;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
            });
        }
    };
}]);
