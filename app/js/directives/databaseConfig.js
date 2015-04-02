'use strict';

angular.module('neonDemo.directives')
.directive('databaseConfig', ['datasets', 'ConnectionService', 'DatasetService', function(datasets, connectionService, datasetService) {
    return {
        templateUrl: 'partials/directives/databaseConfig.html',
        restrict: 'E',
        scope: {
            storeSelect: '=',
            hostName: '='
        },
        link: function($scope, el) {
            el.addClass('databaseConfig');

            $scope.showDbTable = false;
            $scope.selectedDb = null;
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
                XDATA.activityLogger.logUserActivity('User selected new datastore',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        datastore: $scope.datastoreSelect,
                        hostname: $scope.hostnameInput
                    });

                $scope.showDbTable = true;

                // Connect to the datastore.
                $scope.connection = new neon.query.Connection();
                $scope.connection.connect($scope.datastoreSelect, $scope.hostnameInput);

                // Save the connection in the connection service for reuse by other directives.
                connectionService.setActiveConnection($scope.connection);

                // Clear the table names to force re-selection by the user.
                $scope.databases = [];
                $scope.dbTables = [];
                $scope.selectedDb = null;
                $scope.selectedTable = null;

                // Flag that we're connected for the front-end controls enable/disable code.
                $scope.isConnected = true;

                // Pull in the databse names.
                $scope.connection.getDatabaseNames(function(results) {
                    $scope.$apply(function() {
                        populateDatabaseDropdown(results);
                    });
                });
            };

            $scope.connectToPreset = function(server) {
                XDATA.activityLogger.logUserActivity('User selected preset dataset',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        preset: server.name
                    });

                datasetService.setActiveDataset(server);

                // Change name of active connection.
                $scope.activeServer = server.name;

                // Set datastore connection details and connect to the datastore.
                $scope.datastoreSelect = server.datastore;
                $scope.hostnameInput = server.hostname;
                $scope.connectToDataServer();

                $scope.selectedDb = server.database;
                $scope.selectedTable = server.tables[0].name;
                $scope.tableFields = server.tables[0].fields;
                $scope.tableFieldMappings = server.tables[0].mappings;

                $scope.selectDatabase(function() {
                    // Wait to connect to the new dataset and publish the change until we've updated the field names.
                    $scope.connectToDatasetAndPublishActiveDatasetChanged();
                });
            };

            var populateDatabaseDropdown = function(dbs) {
                $scope.databases = dbs;
            };

            $scope.selectDatabase = function(updateFieldsCallback) {
                XDATA.activityLogger.logUserActivity('User selected new database',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        database: $scope.selectedDb
                    });

                if($scope.selectedDb) {
                    $scope.connection.use($scope.selectedDb);
                    $scope.connection.getTableNames(function(tableNames) {
                        $scope.$apply(function() {
                            populateTableDropdown(tableNames);
                        });
                    });
                    $scope.updateFieldsForTables(updateFieldsCallback);
                } else {
                    $scope.dbTables = [];
                }
            };

            $scope.updateFieldsForTables = function(updateFieldsCallback) {
                $scope.tableNameToFieldNames = {};

                $scope.connection.getTableNamesAndFieldNames(function(tableNamesAndFieldNames) {
                    $scope.$apply(function() {
                        for(var tableName in tableNamesAndFieldNames) {
                            datasetService.updateFields(tableName, tableNamesAndFieldNames[tableName]);
                            // Store fields for each table locally because the dataset service ignores tables not included in the dataset.
                            // TODO Determine how to handle fields from tables in the database that are not included in the dataset.  This may
                            //      be solved once we update the custom connection interface to support multi-table datasets and field mappings.
                            $scope.tableNameToFieldNames[tableName] = tableNamesAndFieldNames[tableName];

                            if(tableName === $scope.selectedTable) {
                                $scope.tableFields = datasetService.getDatabaseFields(tableName);
                            }
                        }

                        if(updateFieldsCallback) {
                            updateFieldsCallback();
                        }
                    });
                });
            };

            $scope.selectTable = function() {
                XDATA.activityLogger.logUserActivity('User selected new table',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        table: $scope.selectedTable
                    });

                $scope.tableFields = datasetService.getDatabaseFields($scope.selectedTable);
                // If the table does not exist in the dataset configuration, use the locally stored field names for the table.
                if(!($scope.tableFields.length)) {
                    $scope.tableFields = $scope.tableNameToFieldNames[$scope.selectedTable];
                }
                $scope.tableFieldMappings = datasetService.getMappings($scope.selectedTable);
            };

            $scope.selectField = function() {
                XDATA.activityLogger.logUserActivity('User mapped a field',
                    'connect', XDATA.activityLogger.WF_GETDATA);
            };

            $scope.openedCustom = function() {
                XDATA.activityLogger.logUserActivity('User opened custom connection dialog',
                    'connect', XDATA.activityLogger.WF_GETDATA);
            };

            var populateTableDropdown = function(tables) {
                $scope.dbTables = tables;
            };

            $scope.connectToDatasetAndPublishActiveDatasetChanged = function() {
                $scope.messenger.clearFiltersSilently(function() {
                    connectionService.connectToDataset($scope.datastoreSelect, $scope.hostnameInput, $scope.selectedDb);
                    $scope.messenger.publish("active_dataset_changed", {
                        datastore: $scope.datastoreSelect,
                        hostname: $scope.hostnameInput,
                        database: $scope.selectedDb
                    });
                    XDATA.activityLogger.logSystemActivity('Publishing Neon Active Dataset Change message', {
                        datastore: $scope.datastoreSelect,
                        hostname: $scope.hostnameInput,
                        database: $scope.selectedDb
                    });
                });
            };

            $scope.connectClick = function() {
                $scope.activeServer = "Custom";

                datasetService.setActiveDataset({
                    datastore: $scope.datastoreSelect,
                    hostname: $scope.hostnameInput,
                    database: $scope.selectedDb,
                    tables: [{
                        name: $scope.selectedTable
                    }]
                });

                for(var key in $scope.fields) {
                    if(Object.prototype.hasOwnProperty.call($scope.fields, key)) {
                        var field = $scope.fields[key];
                        if(field.selected) {
                            datasetService.setMapping($scope.selectedTable, field.name, field.selected);
                        }
                    }
                }

                XDATA.activityLogger.logUserActivity('User requested new dataset',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        datastore: $scope.datastoreSelect,
                        hostname: $scope.hostnameInput,
                        database: $scope.selectedDb,
                        table: $scope.selectedTable
                    });

                $scope.connectToDatasetAndPublishActiveDatasetChanged();
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
