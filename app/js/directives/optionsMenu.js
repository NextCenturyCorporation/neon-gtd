'use strict';
angular.module('neonDemo.directives')
.directive('optionsMenu', function() {
    return {
        templateUrl: 'partials/directives/optionsMenu.html',
        restrict: 'EA',
        transclude: true,
        scope: {
            parentElement: '=',
            buttonText: '=?',
            showButtonText: '=?'
        },
        link: function($scope, $element) {
            // Buffer needed above and below the chart options popover based on popover position, container padding (both set in the CSS), and UX.
            $scope.CHART_OPTIONS_BUFFER_Y = 65;

            $scope.optionsDisplayed = false;
            $scope.uniqueVisualizationOptions = 'chart-options-' + uuid();
            $element.find('.chart-options').addClass($scope.uniqueVisualizationOptions);

            $scope.toggleOptionsDisplay = function() {
                $scope.optionsDisplayed = !$scope.optionsDisplayed;
                var activity = ($scope.optionsDisplayed) ? 'show' : 'hide';
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: $scope.uniqueVisualizationOptions,
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["options"]
                });
            };

            $scope.getButtonText = function() {
                if($.isFunction($scope.buttonText)) {
                    return $scope.buttonText();
                }
                return $scope.buttonText;
            };

            var resizeMenu = function() {
                var chartOptions = $element.find(".chart-options");
                var height = $scope.parentElement.innerHeight() - (chartOptions.outerHeight(true) - chartOptions.height() + $scope.CHART_OPTIONS_BUFFER_Y);
                chartOptions.find(".popover-content").css("max-height", height + "px");
            };

            $scope.parentElement.resize(resizeMenu);

            // Resize the options menu to reflect the initial size of the parent element.
            resizeMenu();
        }
    };
});
