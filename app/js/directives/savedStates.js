'use strict';
/*
 * Copyright 2015 Next Century Corporation
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

/**
 * This Angular JS directive gives modals for loading, deleting, saving, and overwriting states.
 *
 * @namespace neonDemo.directives
 * @class savedStates
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('savedStates', ['$location', 'ConnectionService', 'ErrorNotificationService', 'DatasetService','VisualizationService',
    function($location, connectionService, errorNotificationService, datasetService, visualizationService) {
    return {
        templateUrl: 'partials/directives/savedStates.html',
        restrict: 'EA',
        link: function($scope) {
            $scope.stateNames = [];
            $scope.stateName = "";
            $scope.stateNameError = false;
            $scope.messenger = new neon.eventing.Messenger();

            /*
             * Saves the current state to the given name.
             * @param {String} name
             * @method saveState
             */
            $scope.saveState = function(name) {
                var stateParams = {
                    dashboard: $scope.visualizations,
                    dataset: cleanDataset(datasetService.getDataset())
                };

                if(name) {
                    stateParams.stateName = name;
                }

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    // Get each visualization's bindings and save them to our dashboard state parameter
                    visualizationService.getWidgets().forEach(function(widget) {
                        var bindings = widget.callback();
                        var visualization = _.where(stateParams.dashboard, {
                            id: widget.id
                        });
                        if(visualization && visualization.length) {
                            visualization[0].bindings = angular.copy(bindings);
                        }
                    });

                    connection.saveState(stateParams, handleSaveStateSuccess, handleStateFailure);
                }
            };

            /*
             * Validates a state's name by checking that the name doesn't exist already for another saved state.
             * @method validateName
             */
            $scope.validateName = function() {
                $scope.stateNameError = (!$scope.stateNames.length || $scope.stateNames.indexOf($scope.stateName) === -1 ? false : true);
            };

            /*
             * Opens the new state modal.
             * @method newState
             */
            $scope.newState = function() {
                $scope.stateName = "";
                $('#saveNewStateModal').modal('show');
            };

            /*
             * Loads the states for the name choosen and updates the dashboard and url parameters.
             * @method loadState
             */
            $scope.loadState = function() {
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    var params = {
                        stateName: $scope.stateName
                    };
                    connection.loadState(params, function(dashboardState) {
                        if(_.keys(dashboardState).length) {
                            $location.url($location.path());
                            $location.search("dashboard_state_id", dashboardState.dashboardStateId);
                            $location.search("filter_state_id", dashboardState.filterStateId);

                            var matchingDataset = datasetService.getDatasetWithName(dashboardState.dataset.name);
                            if(!matchingDataset) {
                                datasetService.addDataset(dashboardState.dataset);
                                matchingDataset = dashboardState.dataset;
                            }

                            var stateConnection = connectionService.createActiveConnection(matchingDataset.datastore, matchingDataset.hostname);

                            // Update dataset fields, then set as active and update the dashboard
                            datasetService.updateDatabases(matchingDataset, stateConnection, function(dataset) {
                                datasetService.setActiveDataset(dataset);

                                $scope.messenger.publish("STATE_CHANGED", dashboardState.dashboard);
                            });
                        } else {
                            errorNotificationService.showErrorMessage(null, "State " + $scope.stateName + " not found.");
                        }
                    }, handleStateFailure);
                }
            };

            /*
             * Deletes the state for the name choosen.
             * @method deleteState
             */
            $scope.deleteState = function() {
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.deleteState($scope.stateName, function(stateIds) {
                        $scope.$apply(function() {
                            var params = $location.search();
                            var dashboardStateId = params.dashboard_state_id;
                            var filterStateId = params.filter_state_id;

                            // Delete the state parameters if either match the IDs deleted
                            if(dashboardStateId && stateIds.dashboardStateId && dashboardStateId === stateIds.dashboardStateId)  {
                                $location.search("dashboard_state_id", null);
                            }
                            if(filterStateId && stateIds.filterStateId && filterStateId === stateIds.filterStateId)  {
                                $location.search("filter_state_id", null);
                            }
                        });
                    }, handleStateFailure);
                }
            };

            /*
             * Replaces the url parameters on a successful state save.
             * @param {Object} response
             * @method handleSaveStateSuccess
             * @private
             */
            var handleSaveStateSuccess = function(response) {
                $scope.$apply(function() {
                    $scope.dashboardStateId = response.dashboardStateId;
                    $scope.filterStateId = response.filterStateId;

                    // Add/Replace state ids in the url parameters
                    $location.search("dashboard_state_id", response.dashboardStateId);
                    $location.search("filter_state_id", response.filterStateId);
                });
            };

            /*
             * Shows an error notification on a state call error.
             * @param {Object} response
             * @method handleStateFailure
             * @private
             */
            var handleStateFailure = function(response) {
                errorNotificationService.showErrorMessage(null, response.responseJSON.error);
            };

            /*
             * Removes any unnecessary objects from the given dataset.
             * @param {Object} dataset
             * @method cleanDataset
             * @private
             */
            var cleanDataset = function(dataset) {
                _.each(dataset.databases, function(database) {
                    _.each(database.tables, function(table) {
                        delete table.dateBrushExtent;
                    });
                });
                return dataset;
            };

            /*
             * Retrieves all the current state names before when any of the modals are shown.
             * @method modalOnShow
             * @private
             */
            var modalOnShow = function() {
                $scope.stateName = "";
                $scope.stateNameError = false;

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.getAllStates(function(stateNames) {
                        $scope.$apply(function() {
                            $scope.stateNames = stateNames;
                        });
                    }, function(response) {
                        $scope.stateNames = [];
                        errorNotificationService.showErrorMessage(null, response.responseJSON.error);
                    });
                }
            };

            $('#overwriteStateModal').on('show.bs.modal', modalOnShow);
            $('#saveNewStateModal').on('show.bs.modal', modalOnShow);
            $('#loadStateModal').on('show.bs.modal', modalOnShow);
            $('#deleteStateModal').on('show.bs.modal', modalOnShow);
        }
    };
}]);
