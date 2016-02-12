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
.directive('savedStates', ['$location', 'ConnectionService', 'ErrorNotificationService', 'DatasetService','VisualizationService', 'ParameterService',
    function($location, connectionService, errorNotificationService, datasetService, visualizationService, parameterService) {
    return {
        templateUrl: 'components/savedStates/savedStates.html',
        restrict: 'EA',
        link: function($scope) {
            $scope.stateNames = [];
            $scope.stateName = "";
            $scope.stateNameError = false;
            $scope.isLoading = false;
            $scope.messenger = new neon.eventing.Messenger();

            /*
             * Saves the current state to the given name.
             * @param {String} name
             * @method saveState
             */
            $scope.saveState = function(name) {
                var stateParams = {
                    dashboard: $scope.visualizations
                };

                if(name) {
                    stateParams.stateName = name;
                }

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    datasetService.setLineCharts({});
                    datasetService.setMapLayers({});

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

                    stateParams.dataset = datasetService.getDataset();

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

                            parameterService.loadStateSuccess(dashboardState, dashboardState.dashboardStateId);
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

            $scope.getDefaultOptionTitle = function() {
                return $scope.isLoading ? 'Loading...' : 'Select a name';
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
             * Retrieves all the current state names before when any of the modals are shown.
             * @method modalOnShow
             * @private
             */
            var modalOnShow = function() {
                $scope.stateName = "";
                $scope.stateNameError = false;

                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    connection = connectionService.createActiveConnection();
                }

                $scope.isLoading = true;
                connection.getAllStateNames(function(stateNames) {
                    $scope.$apply(function() {
                        $scope.isLoading = false;
                        $scope.stateNames = stateNames;
                    });
                }, function(response) {
                    $scope.isLoading = false;
                    $scope.stateNames = [];
                    errorNotificationService.showErrorMessage(null, response.responseJSON.error);
                });
            };

            $('#overwriteStateModal').on('show.bs.modal', modalOnShow);
            $('#saveNewStateModal').on('show.bs.modal', modalOnShow);
            $('#loadStateModal').on('show.bs.modal', modalOnShow);
            $('#deleteStateModal').on('show.bs.modal', modalOnShow);
        }
    };
}]);
