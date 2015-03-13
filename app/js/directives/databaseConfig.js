'use strict';

angular.module('neonDemo.directives')
.directive('databaseConfig', ['ConnectionService', function(connectionService) {
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
            $scope.isConnected = false;
            $scope.clearPopover = '';
            $scope.activeServer = "Choose dataset";
            $scope.servers = [
//                {
//                    name: "Earthquakes",
//                    datastoreSelect: "mongo",
//                    hostnameInput: "localhost",
//                    selectedDb: "test",
//                    selectedTable: "earthquakes"
//                },
//                {
//                    name: "South America Tweets",
//                    datastoreSelect: "mongo",
//                    hostnameInput: "localhost",
//                    selectedDb: "test",
//                    selectedTable: "alibaverstock130k"
//                },
                {
                    name: "Twitter",
                    datastoreSelect: "mongo",
                    hostnameInput: "localhost",
                    // hostnameInput: "192.168.0.129",
                    selectedDb: "test",
                    selectedTable: "twitter36",
                    connectOnLoad: true
                },
//                {
//                    name: "Traffic",
//                    datastoreSelect: "mongo",
//                    hostnameInput: "localhost",
//                    selectedDb: "test",
//                    selectedTable: "most_active"
//                }
            ];
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
                // Change name of active connection.
                $scope.activeServer = server.name;

                // Set datastore connection details and connect to the datastore.
                $scope.datastoreSelect = server.datastoreSelect;
                $scope.hostnameInput = server.hostnameInput;
                $scope.connectToDataServer();

                // Set database name and get list of tables.
                $scope.selectedDb = server.selectedDb;
                $scope.selectDatabase();

                // Set table name and initiate connection.
                $scope.selectedTable = server.selectedTable;
                $scope.selectTable();
                $scope.connectToDatabase();
            };

            var populateDatabaseDropdown = function(dbs) {
                $scope.databases = dbs;
            };

            $scope.selectDatabase = function() {
                XDATA.activityLogger.logUserActivity('User selected new database',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        database: $scope.selectedDb
                    });

                if($scope.selectedDb) {
                    $scope.connection.use($scope.selectedDb);
                    $scope.connection.getTableNames(function(tables) {
                        $scope.$apply(function() {
                            populateTableDropdown(tables);
                        });
                    });
                } else {
                    $scope.dbTables = [];
                }
            };

            $scope.selectTable = function() {
                XDATA.activityLogger.logUserActivity('User selected new table',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        table: $scope.selectedTable
                    });
                $scope.connection.getFieldNames($scope.selectedTable, function(result) {
                    $scope.$apply(function() {
                        $scope.tableFields = result;
                    });
                    connectionService.connectToDataset($scope.datastoreSelect, $scope.hostnameInput, $scope.selectedDb, $scope.selectedTable);
                    $scope.applyDefaultFields();
                });
            };

            $scope.applyDefaultFields = function() {
                connectionService.loadMetadata(function() {
                    $scope.$apply(function() {
                        var mappings = connectionService.getFieldMappings();
                        for(var key in $scope.fields) {
                            if(Object.prototype.hasOwnProperty.call($scope.fields, key)) {
                                var field = $scope.fields[key];
                                field.selected = mappings.hasOwnProperty(field.name) ? mappings[field.name] : "";
                            }
                        }
                    });
                });
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

            $scope.connectToDatabase = function() {
                $scope.messenger.clearFiltersSilently(function() {
                    $scope.broadcastActiveDataset();
                });
            };

            $scope.connectClick = function() {
                // Set active connection to Custom and connect.
                $scope.activeServer = "Custom";
                for(var key in $scope.fields) {
                    if(Object.prototype.hasOwnProperty.call($scope.fields, key)) {
                        var field = $scope.fields[key];
                        connectionService.setFieldMapping(field.name, field.selected);
                    }
                }
                $scope.connectToDatabase();
                XDATA.activityLogger.logUserActivity('User requested new dataset',
                    'connect', XDATA.activityLogger.WF_GETDATA, {
                        datastore: $scope.datastoreSelect,
                        hostname: $scope.hostnameInput,
                        database: $scope.selectedDb,
                        table: $scope.selectedTable
                    });
            };

            $scope.broadcastActiveDataset = function() {
                // TODO: Alter or eliminate this when the Connection class in Neon is changed to emit
                // dataset selections.
                var message = {
                    datastore: $scope.datastoreSelect,
                    hostname: $scope.hostnameInput,
                    database: $scope.selectedDb,
                    table: $scope.selectedTable
                };
                $scope.messenger.publish(neon.eventing.channels.ACTIVE_DATASET_CHANGED, message);
                XDATA.activityLogger.logSystemActivity('Publishing Neon Active Dataset Change message',
                    message);
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
