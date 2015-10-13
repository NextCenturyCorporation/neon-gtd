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

/**
 * This Angular JS directive adds a simple Powered By Neon link to a page along with an About Neon modal
 * that will appear when the link is clicked.  As the modal has a custom id, it is intended that only
 * one of these is included in the page for now.
 *
 * @example
 *    &lt;powered-by-neon&gt;&lt;/powered-by-neon&gt;<br>
 *    &lt;div powered-by-neon&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class heatMap
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('poweredByNeon', function($http) {
    return {
        templateUrl: 'partials/directives/poweredByNeon.html',
        restrict: 'EA',
        link: function($scope) {
            var NEON_GTD_VERSION_FILE = './config/version.json';
            $scope.serverVersionString = "Loading...";
            $scope.neonGTDVersionString = "Loading...";

            $scope.serverInfoLoaded = false;
            $scope.neonGTDVersionLoaded = false;

            $scope.loadNeonInfo = function() {
                if(!$scope.serverInfoLoaded) {
                    neon.util.infoUtils.getNeonVersion(function(result) {
                        $scope.$apply(function() {
                            $scope.serverVersionString = result;
                            $scope.serverInfoLoaded = false;
                        });
                    });
                }

                if(!$scope.neonGTDVersionLoaded) {
                    $http.get(NEON_GTD_VERSION_FILE).
                        success(function(data) {
                            $scope.neonGTDVersionString = data.version;
                            $scope.neonGTDVersionLoaded = true;
                        }).
                        error(function() {
                            $scope.neonGTDVersionString = "Unavailable";
                            $scope.neonGTDVersionLoaded = true;
                        });
                }
            };
        }
    };
});
