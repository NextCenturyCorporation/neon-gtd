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

angular.module('neonDemo.directives')
.directive('linksPopupButton', ['popups', function(popups) {
    return {
        template: "<span ng-if='enabled'>" + popups.links.ENABLED_TEMPLATE + "</span><span ng-if='!enabled'>" + popups.links.DISABLED_TEMPLATE + "</span>",
        restrict: "EA",
        scope: {
            key: '@',
            source: '@',
            tooltip: '@',
            json: '@?',
            disable: '@?'
        },
        link: function($scope) {
            $scope.json = $scope.json || popups.links.createButtonJson($scope.source, $scope.key);
            $scope.enabled = $scope.disable === undefined || $scope.disable === "false" || $scope.disable === "0" || $scope.disable === "";
        }
    };
}]);
